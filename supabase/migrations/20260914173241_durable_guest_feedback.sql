begin;
create schema if not exists private;
-- Only these narrowly callable implementations live here. Do not expose this
-- schema through PostgREST or grant guests usage on the existing private schema.
create schema guest_feedback_api;

-- A low rating must not require private text or prevent a public review.
alter table public.guest_feedback drop constraint guest_feedback_shape;
alter table public.guest_feedback add constraint guest_feedback_shape check (
  (kind = 'rating' and star_rating is not null)
  or (kind = 'complaint' and star_rating between 1 and 3)
  or (kind = 'recovery' and star_rating is null and feedback_text is not null)
);

create table private.feedback_submission_receipts (
  submission_id uuid primary key,
  target_mode text not null check (target_mode in ('request', 'property')),
  target_id uuid not null,
  location_id uuid not null references public.locations(id) on delete cascade,
  payload_hash bytea not null,
  feedback_id uuid not null references public.guest_feedback(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.feedback_submission_receipts enable row level security;
revoke all on private.feedback_submission_receipts from public, anon, authenticated;

-- Public guests are intentionally unauthenticated. Authority is a request UUID
-- capability or the public property QR UUID, NEVER caller-supplied account data.
-- Privileged implementation stays outside the exposed schema. This helper
-- returns only public property metadata; no customer or feedback text.
create function private.feedback_gate_location(p_mode text, p_target_id uuid)
returns table(location_id uuid, account_id uuid, location_name text, google_place_url text, recovery_email text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.account_id, l.name, l.google_place_url, l.recovery_email
  from public.locations l
  where (p_mode = 'property' and l.id = p_target_id)
     or (p_mode = 'request' and exists (
       select 1 from public.review_requests rr
       join public.orders o on o.id = rr.order_id
       join public.customers c on c.id = o.customer_id and c.account_id = l.account_id
       where rr.id = p_target_id and o.location_id = l.id
         and rr.status in ('pending', 'sent', 'clicked', 'private_feedback')
         and o.status not in ('canceled', 'cancelled')
         and o.checkout_date is not null
         and (now() at time zone (select tz.name from pg_catalog.pg_timezone_names tz where tz.name = l.timezone limit 1))::date
           <= (o.checkout_date at time zone 'UTC')::date + 14
     ));
$$;
revoke all on function private.feedback_gate_location(text, uuid) from public, anon, authenticated;

create function guest_feedback_api.read_guest_feedback_context(p_mode text, p_target_id uuid)
returns table(location_id uuid, location_name text, google_place_url text, recovery_email text)
language sql stable security definer set search_path = '' as $$
  select l.location_id, l.location_name, l.google_place_url, l.recovery_email
  from private.feedback_gate_location(p_mode, p_target_id) l;
$$;
revoke all on function guest_feedback_api.read_guest_feedback_context(text, uuid) from public;
grant usage on schema guest_feedback_api to anon, authenticated;
grant execute on function guest_feedback_api.read_guest_feedback_context(text, uuid) to anon, authenticated;
create function public.get_guest_feedback_context_v2(p_mode text, p_target_id uuid)
returns table(location_id uuid, location_name text, google_place_url text, recovery_email text)
language sql stable security invoker set search_path = '' as $$
  select c.location_id, c.location_name, c.google_place_url, c.recovery_email
  from guest_feedback_api.read_guest_feedback_context(p_mode, p_target_id) c;
$$;
revoke all on function public.get_guest_feedback_context_v2(text, uuid) from public;
grant execute on function public.get_guest_feedback_context_v2(text, uuid) to anon, authenticated;

create function guest_feedback_api.save_guest_feedback(
  p_mode text, p_target_id uuid, p_submission_id uuid, p_star_rating integer,
  p_feedback_text text, p_guest_name text, p_guest_email text
)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_text text := nullif(btrim(p_feedback_text), '');
  v_name text := nullif(btrim(p_guest_name), '');
  v_email text := nullif(lower(btrim(p_guest_email)), '');
  v_hash bytea;
  v_receipt private.feedback_submission_receipts%rowtype;
  v_location record;
  v_kind text;
  v_customer uuid; v_order uuid; v_request uuid; v_feedback uuid;
  v_total integer; v_actionable integer;
begin
  if p_mode is null or p_mode not in ('request', 'property') or p_target_id is null or p_submission_id is null
    or (p_star_rating is not null and p_star_rating not between 1 and 5)
    or (p_star_rating is null and v_text is null)
    or char_length(p_feedback_text) > 4000 or char_length(p_guest_name) > 200 or char_length(p_guest_email) > 320
    or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_hash := sha256(convert_to(jsonb_build_array(p_star_rating, v_text, v_name, v_email)::text, 'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(p_submission_id::text, 8121));
  select r.submission_id, r.target_mode, r.target_id, r.location_id, r.payload_hash, r.feedback_id, r.created_at
    into v_receipt from private.feedback_submission_receipts r where r.submission_id = p_submission_id;
  if found then
    if v_receipt.target_mode = p_mode and v_receipt.target_id = p_target_id and v_receipt.payload_hash = v_hash then
      return jsonb_build_object('status', 'duplicate', 'submission_id', p_submission_id);
    end if;
    return jsonb_build_object('status', 'conflict');
  end if;

  select l.location_id, l.account_id into v_location from private.feedback_gate_location(p_mode, p_target_id) l;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  -- All guest submissions to a property share a short transaction lock, making
  -- count-before-insert caps atomic among these writers, not browser guesses.
  perform pg_advisory_xact_lock(hashtextextended(v_location.location_id::text, 8122));
  if p_mode = 'request' then
    -- Serialize with cancellation/status updates and recheck eligibility.
    perform o.id from public.orders o join public.review_requests rr on rr.order_id = o.id
      where rr.id = p_target_id for update of o;
    perform rr.id from public.review_requests rr where rr.id = p_target_id for update;
  end if;
  select l.location_id, l.account_id into v_location from private.feedback_gate_location(p_mode, p_target_id) l;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  v_kind := case when p_star_rating is null then 'recovery' when p_star_rating <= 3 then 'complaint' else 'rating' end;
  if p_mode = 'property' then
    select count(*), count(*) filter (where gf.kind <> 'rating') into v_total, v_actionable
      from public.guest_feedback gf join public.review_requests rr on rr.id = gf.request_id
      where gf.location_id = v_location.location_id and rr.origin = 'qr' and gf.created_at > now() - interval '1 hour';
    if v_total >= 200 or (v_kind <> 'rating' and v_actionable >= 15) then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    insert into public.customers(account_id, first_name, last_name, email)
      values (v_location.account_id, coalesce(split_part(v_name, ' ', 1), 'Guest'),
        coalesce(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''), v_email) returning id into v_customer;
    insert into public.orders(location_id, customer_id, checkout_date, status)
      values (v_location.location_id, v_customer, now(), 'completed') returning id into v_order;
    insert into public.review_requests(order_id, status, origin)
      values (v_order, 'private_feedback', 'qr') returning id into v_request;
  else
    v_request := p_target_id;
    select count(*) into v_total from public.guest_feedback gf
      where gf.request_id = v_request and gf.created_at > now() - interval '1 hour';
    if v_total >= 5 then return jsonb_build_object('status', 'rate_limited'); end if;
  end if;
  -- EGRESS-COST: low — one atomic mutation and one small acknowledgement.
  insert into public.guest_feedback(request_id, location_id, kind, star_rating, feedback_text, guest_name, guest_email)
    values (v_request, v_location.location_id, v_kind, p_star_rating, v_text, v_name, v_email) returning id into v_feedback;
  -- Submission stops further invitations for every rating. It does NOT claim a
  -- Google visit or confirmed public review; reporting cleanup is separate.
  update public.review_requests set status = 'private_feedback' where id = v_request;
  insert into private.feedback_submission_receipts(submission_id, target_mode, target_id, location_id, payload_hash, feedback_id)
    values (p_submission_id, p_mode, p_target_id, v_location.location_id, v_hash, v_feedback);
  return jsonb_build_object('status', 'accepted', 'submission_id', p_submission_id);
end;
$$;
revoke all on function guest_feedback_api.save_guest_feedback(text, uuid, uuid, integer, text, text, text) from public;
grant execute on function guest_feedback_api.save_guest_feedback(text, uuid, uuid, integer, text, text, text) to anon, authenticated;
create function public.submit_guest_feedback_v2(
  p_mode text, p_target_id uuid, p_submission_id uuid, p_star_rating integer,
  p_feedback_text text default null, p_guest_name text default null, p_guest_email text default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select guest_feedback_api.save_guest_feedback(p_mode, p_target_id, p_submission_id, p_star_rating, p_feedback_text, p_guest_name, p_guest_email);
$$;
revoke all on function public.submit_guest_feedback_v2(text, uuid, uuid, integer, text, text, text) from public;
grant execute on function public.submit_guest_feedback_v2(text, uuid, uuid, integer, text, text, text) to anon, authenticated;

-- Retire silent-success/non-idempotent guest writers. Old clients must refresh,
-- not fall back to an API that bypasses the receipt and atomic throttle.
revoke execute on function public.submit_guest_feedback(uuid, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.submit_property_feedback(uuid, integer, text, text, text) from public, anon, authenticated;

-- Recognition is optional enrichment, not a condition for retaining feedback.
-- pg_net enqueues work; failures to enqueue cannot roll back the guest's words.
create function private.enqueue_guest_feedback_recognition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform net.http_post(
      url := 'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/scan-feedback-recognition',
      body := jsonb_build_object('feedback_id', new.id), params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', private.cron_auth_header()),
      timeout_milliseconds := 30000);
  exception when others then
    raise warning 'Feedback saved; recognition could not be queued.';
  end;
  return new;
end;
$$;
revoke all on function private.enqueue_guest_feedback_recognition() from public, anon, authenticated;
drop trigger if exists on_guest_feedback_insert on public.guest_feedback;
create trigger on_guest_feedback_insert after insert on public.guest_feedback
  for each row when (new.kind <> 'rating' and new.feedback_text is not null)
  execute function private.enqueue_guest_feedback_recognition();
commit;
