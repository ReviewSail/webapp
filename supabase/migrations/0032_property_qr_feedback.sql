-- Property QR links: let a guest rate a stay we were never told about.
--
-- Airbnb never releases a guest's real email — it issues an alias that stops
-- forwarding shortly after checkout, which is exactly when we send. Booking.com
-- masks too. For those hosts the CSV import can never deliver anything, so the
-- only workable path is the one the rest of the industry uses: a code the guest
-- scans while they are still on the property.
--
-- This is the same star-gate as the emailed one, entered from a poster instead
-- of a link, with the stay created on submit rather than imported in advance.

-- --------------------------------------------------------------------------
-- Where a request came from
--
-- Not orders.source: that records the *booking channel* (an Airbnb booking
-- scanned from a poster is still an Airbnb booking). Conflating the two would
-- corrupt the per-channel reporting added in 0031.
-- --------------------------------------------------------------------------
alter table public.review_requests
  add column if not exists origin text;

comment on column public.review_requests.origin is
  'How the guest reached the gate: email | sms | qr. Null on requests predating this column.';

-- Supports the per-property throttle below.
create index if not exists review_requests_qr_recent_idx
  on public.review_requests (created_at)
  where origin = 'qr';

-- --------------------------------------------------------------------------
-- submit_property_feedback
--
-- Mirrors submit_guest_feedback (0025), with one important difference in the
-- threat model: that function is guarded by an unguessable request id, whereas
-- a property code is *printed on a poster*. It is public by design, so anyone
-- who photographs it can call this. Everything below assumes a hostile caller.
-- --------------------------------------------------------------------------
create or replace function public.submit_property_feedback(
  p_location_id   uuid,
  p_star_rating   int  default null,
  p_feedback_text text default null,
  p_guest_name    text default null,
  p_guest_email   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_account_id  uuid;
  v_kind        text;
  v_text        text := nullif(btrim(p_feedback_text), '');
  v_name        text := nullif(btrim(p_guest_name), '');
  v_email       text := lower(nullif(btrim(p_guest_email), ''));
  v_first       text;
  v_last        text;
  v_customer_id uuid;
  v_order_id    uuid;
  v_request_id  uuid;
  v_status      text;
begin
  -- 1. Capability check, and the only source of account_id. Silent no-op on a
  --    miss rather than an error: a distinguishable failure would turn this
  --    into an oracle for enumerating which properties exist.
  select account_id into v_account_id
  from public.locations
  where id = p_location_id;

  if v_account_id is null then
    return;
  end if;

  -- 2. Derive kind from the shape of the submission, never from the caller —
  --    otherwise a 1-star complaint could be labelled 'rating' to dodge both
  --    the recognition trigger and the shape constraint.
  if p_star_rating is null then
    v_kind := 'recovery';
  elsif p_star_rating between 1 and 3 then
    v_kind := 'complaint';
  elsif p_star_rating between 4 and 5 then
    v_kind := 'rating';
  else
    -- Out of range entirely; guest_feedback_star_rating_check would reject it.
    return;
  end if;

  if v_kind <> 'rating' and v_text is null then
    return;
  end if;

  -- 3. Throttle, per property per hour. A busy hotel might see a few dozen
  --    scans an hour; nothing legitimate approaches this. The cap also bounds
  --    the OpenAI spend behind handle_new_guest_feedback, which fires on every
  --    non-rating row.
  if (
    select count(*)
    from public.review_requests rr
    join public.orders o on o.id = rr.order_id
    where o.location_id = p_location_id
      and rr.origin = 'qr'
      and rr.created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'Too many submissions for this property. Please try again later.'
      using errcode = '53400';
  end if;

  -- 4. One submission per guest per property per day. Returns quietly so a
  --    double-tap on the submit button looks like success rather than an error.
  if v_email is not null and exists (
    select 1 from public.guest_feedback gf
    where gf.location_id = p_location_id
      and lower(gf.guest_email) = v_email
      and gf.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  -- 5. Create the stay. customers.first_name/last_name are NOT NULL and a
  --    scanned guest need not tell us who they are, so fall back to a marker
  --    the owner will recognise in the guest list.
  if v_name is null then
    v_first := 'Guest';
    v_last  := '';
  else
    v_first := left(split_part(v_name, ' ', 1), 200);
    v_last  := left(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), 200);
  end if;

  insert into public.customers (account_id, first_name, last_name, email)
  values (v_account_id, v_first, v_last, left(v_email, 320))
  returning id into v_customer_id;

  insert into public.orders (location_id, customer_id, checkout_date, status)
  values (p_location_id, v_customer_id, now(), 'completed')
  returning id into v_order_id;

  -- Never 'pending'. process-reviews sweeps pending requests hourly and would
  -- try to email a guest who arrived by poster and may have left no address.
  v_status := case when v_kind = 'rating' then 'clicked' else 'private_feedback' end;

  insert into public.review_requests (order_id, status, origin)
  values (v_order_id, v_status, 'qr')
  returning id into v_request_id;

  insert into public.guest_feedback (
    request_id, location_id, kind, star_rating,
    feedback_text, guest_name, guest_email
  )
  values (
    v_request_id,
    p_location_id,
    v_kind,
    p_star_rating,
    left(v_text, 4000),
    left(v_name, 200),
    left(v_email, 320)
  );
end;
$function$;

revoke all on function public.submit_property_feedback(uuid, int, text, text, text) from public;
grant execute on function public.submit_property_feedback(uuid, int, text, text, text) to anon, authenticated;

comment on function public.submit_property_feedback(uuid, int, text, text, text) is
  'Write path for guests arriving via a property QR code, where no stay was imported. '
  'Creates customer/order/review_request on submit, derives kind and account server-side, '
  'and caps submissions at 60/hour per property since the code is public by design.';

-- --------------------------------------------------------------------------
-- Read side, mirroring get_feedback_gate_context (0018)
--
-- Everything returned here is already visible to anyone holding the poster:
-- the property's name, its public Google review URL, and the address it asks
-- unhappy guests to write to. Nothing about a guest is exposed.
-- --------------------------------------------------------------------------
create or replace function public.get_property_gate_context(p_location_id uuid)
returns table (
  location_id uuid,
  location_name text,
  google_place_url text,
  recovery_email text
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.name, l.google_place_url, l.recovery_email
  from public.locations l
  where l.id = p_location_id;
$$;

revoke all on function public.get_property_gate_context(uuid) from public;
grant execute on function public.get_property_gate_context(uuid) to anon, authenticated;

comment on function public.get_property_gate_context(uuid) is
  'Property-code equivalent of get_feedback_gate_context. Returns only the public '
  'details a guest already sees on the poster; no guest data.';
