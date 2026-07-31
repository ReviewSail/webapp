-- 0025_anon_write_rpcs.sql
--
-- Rate limiting on the public endpoints. Two things shape the design:
--
-- 1. There is no server tier. vercel.json is an SPA rewrite and nothing else —
--    no /api directory, no middleware, no functions. Every write goes from the
--    browser straight to PostgREST and never touches Vercel, so a Vercel WAF
--    rule would protect precisely nothing. Enforcement has to live in Postgres.
--
-- 2. A counter is the second line of defence, not the first. review_requests.id
--    is 122 bits of unguessable capability, and 0018/0020 already removed the
--    anon SELECT that made ids enumerable. Once every anon write *requires* a
--    valid one, anonymous mass insertion stops being slow and starts being
--    impossible.
--
-- So: anon loses every direct table grant and writes only through the SECURITY
-- DEFINER functions below, which check the capability, derive the tenant
-- server-side, and throttle. Anon ends this migration with execute on three
-- functions and write access to zero tables.
--
-- What this closes, per the security advisor's rls_policy_always_true findings:
--   feedback         INSERT WITH CHECK (true)  -- table dropped in 0024
--   private_feedback INSERT WITH CHECK (true)  -- table dropped in 0024
--   opt_outs         INSERT WITH CHECK (true)  -- dropped here

-- --------------------------------------------------------------------------
-- Guest feedback
--
-- `kind` is derived here rather than accepted from the caller. A client that
-- could name its own kind could label a 1-star complaint as a 'rating' and
-- dodge both the recognition trigger and the shape constraint.
-- --------------------------------------------------------------------------
create or replace function public.submit_guest_feedback(
  p_request_id    uuid,
  p_star_rating   int,
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
  v_location_id uuid;
  v_kind        text;
  v_text        text := nullif(btrim(p_feedback_text), '');
begin
  -- 1. Capability check, and the only source of location_id. The browser no
  --    longer supplies it, so a guest cannot file against another tenant.
  select o.location_id
    into v_location_id
  from public.review_requests rr
  join public.orders o on o.id = rr.order_id
  where rr.id = p_request_id
    and rr.status in ('pending', 'sent', 'clicked', 'private_feedback');

  -- Silent no-op rather than an error. A distinguishable failure would turn
  -- this function into an oracle for probing which request ids exist.
  if v_location_id is null then
    return;
  end if;

  -- 2. Derive kind from the shape of the submission.
  if p_star_rating is null then
    v_kind := 'recovery';
  elsif p_star_rating between 1 and 3 then
    v_kind := 'complaint';
  else
    v_kind := 'rating';
  end if;

  -- complaint and recovery both carry the guest's words; without them there is
  -- nothing to action and nothing to scan.
  if v_kind <> 'rating' and v_text is null then
    return;
  end if;

  -- 3. Throttle. A real guest submits once, twice if they also send a recovery
  --    message. Five an hour is generous and still bounds the OpenAI spend
  --    behind the recognition trigger.
  if (
    select count(*) from public.guest_feedback
    where request_id = p_request_id
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Too many submissions for this request. Please try again later.'
      using errcode = '53400';
  end if;

  insert into public.guest_feedback (
    request_id, location_id, kind, star_rating,
    feedback_text, guest_name, guest_email
  )
  values (
    p_request_id,
    v_location_id,
    v_kind,
    p_star_rating,
    left(v_text, 4000),
    left(nullif(btrim(p_guest_name),  ''), 200),
    left(nullif(btrim(p_guest_email), ''), 320)
  );
end;
$function$;

revoke all on function public.submit_guest_feedback(uuid, int, text, text, text) from public;
grant execute on function public.submit_guest_feedback(uuid, int, text, text, text) to anon, authenticated;

comment on function public.submit_guest_feedback(uuid, int, text, text, text) is
  'Sole write path into guest_feedback for guests. Requires a valid review_requests.id, '
  'derives location_id and kind server-side, and caps submissions at 5/hour per request.';

-- --------------------------------------------------------------------------
-- Opt-outs
--
-- The unsubscribe page previously inserted whatever email or phone was in the
-- query string, with no token of any kind — so anyone could unsubscribe anyone,
-- or the entire guest list. Throttling that would only have made it slower.
-- Deriving the address from the request makes opting someone *else* out
-- impossible, which is the actual requirement.
-- --------------------------------------------------------------------------

-- Dedupe before the unique indexes: production currently holds 4 rows carrying
-- 1 distinct address, because nothing ever prevented repeats.
delete from public.opt_outs a
using public.opt_outs b
where a.ctid > b.ctid
  and a.email is not null and b.email is not null
  and lower(a.email) = lower(b.email);

delete from public.opt_outs a
using public.opt_outs b
where a.ctid > b.ctid
  and a.phone is not null and b.phone is not null
  and a.phone = b.phone;

create unique index if not exists opt_outs_email_key
  on public.opt_outs (lower(email)) where email is not null;

create unique index if not exists opt_outs_phone_key
  on public.opt_outs (phone) where phone is not null;

create or replace function public.submit_opt_out(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_email text;
  v_phone text;
begin
  -- Same capability check as above, and the same silent no-op on miss.
  select c.email, c.phone
    into v_email, v_phone
  from public.review_requests rr
  join public.orders o    on o.id = rr.order_id
  join public.customers c on c.id = o.customer_id
  where rr.id = p_request_id;

  if not found or (v_email is null and v_phone is null) then
    return;
  end if;

  if v_email is not null then
    insert into public.opt_outs (email) values (v_email)
    on conflict do nothing;
  end if;

  if v_phone is not null then
    insert into public.opt_outs (phone) values (v_phone)
    on conflict do nothing;
  end if;

  -- Stop the send loop chasing this request any further.
  update public.review_requests
  set status = 'opted_out'
  where id = p_request_id
    and status in ('pending', 'sent', 'clicked');
end;
$function$;

revoke all on function public.submit_opt_out(uuid) from public;
grant execute on function public.submit_opt_out(uuid) to anon, authenticated;

comment on function public.submit_opt_out(uuid) is
  'Sole opt-out path for guests. Derives the contact detail from the review request, '
  'so a caller can only ever unsubscribe the guest whose link they hold.';

-- --------------------------------------------------------------------------
-- Revoke the direct anon write surface
-- --------------------------------------------------------------------------
drop policy if exists "Anyone can insert opt-outs" on public.opt_outs;
drop policy if exists opt_outs_anon_insert_policy on public.opt_outs;
revoke insert, update, delete on table public.opt_outs from anon;

-- guest_feedback was created in 0024 with no anon grant and no anon policy, so
-- there is nothing to revoke there — the RPC above is its only guest entry point.
