-- Split the property-QR throttle by what a submission actually costs.
--
-- 0032 put a single 60/hour cap on every submission to a property. Two problems
-- with one number:
--
--   * It is the same budget for a 5-star tap-through and for a complaint. The
--     tap-through is one insert and nothing else. The complaint fires
--     on_guest_feedback_insert -> scan-feedback-recognition -> OpenAI, and
--     lands in the manager's action queue. Only one of those is worth
--     rationing, and it is not the common one.
--
--   * Because the budget is shared, an attacker who spends it locks out real
--     guests: the property's own poster starts answering "Too many submissions
--     for this property" to everyone. The cap meant to protect the feature
--     became a way to switch it off.
--
-- A per-caller (per-IP) limit is the obvious alternative and is the wrong tool
-- here: guests scanning a poster in a hotel are all behind that hotel's NAT, so
-- an IP cap throttles precisely the people the feature exists for.
--
-- So the total stays generous for the cheap path, and the expensive path — the
-- one that spends money and demands attention — gets a much tighter ceiling.
-- Both counts come from review_requests alone: submit_property_feedback sets
-- status 'clicked' for a rating and 'private_feedback' for everything else, so
-- status is already an exact proxy for kind and needs no extra join.
--
-- This reduces the damage; it does not make the endpoint unabusable. The code
-- is printed on a poster and anyone holding it can still write up to the caps.
-- Making it genuinely hostile-proof needs a challenge on submit (Turnstile or
-- similar), which is a product decision, not a migration.

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
  v_account_id       uuid;
  v_kind             text;
  v_text             text := nullif(btrim(p_feedback_text), '');
  v_name             text := nullif(btrim(p_guest_name), '');
  v_email            text := lower(nullif(btrim(p_guest_email), ''));
  v_first            text;
  v_last             text;
  v_customer_id      uuid;
  v_order_id         uuid;
  v_request_id       uuid;
  v_status           text;
  v_recent_total     integer;
  v_recent_actionable integer;
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
  --    the recognition trigger and the tighter cap below.
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

  -- 3. Two caps from one scan of the last hour's QR requests for this property.
  select count(*),
         count(*) filter (where rr.status = 'private_feedback')
    into v_recent_total, v_recent_actionable
  from public.review_requests rr
  join public.orders o on o.id = rr.order_id
  where o.location_id = p_location_id
    and rr.origin = 'qr'
    and rr.created_at > now() - interval '1 hour';

  -- Overall ceiling. Deliberately loose: a busy property genuinely can see
  -- dozens of scans an hour, and a rating costs nothing to keep.
  if v_recent_total >= 200 then
    raise exception 'Too many submissions for this property. Please try again later.'
      using errcode = '53400';
  end if;

  -- The one that costs money and attention. Fifteen unresolved complaints in a
  -- single hour is already far beyond anything a real property produces.
  if v_kind <> 'rating' and v_recent_actionable >= 15 then
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

comment on function public.submit_property_feedback(uuid, int, text, text, text) is
  'Write path for guests arriving via a property QR code, where no stay was imported. '
  'Creates customer/order/review_request on submit, derives kind and account server-side. '
  'Capped at 200 submissions/hour per property overall and 15/hour for the ones that '
  'carry text, since those fire the recognition scan and enter the action queue — see 0033.';
