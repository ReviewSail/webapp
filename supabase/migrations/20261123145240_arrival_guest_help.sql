begin;
-- Legacy properties retain their previous day/hour until the host opts in.
alter table public.locations add column checkin_schedule text check (checkin_schedule in ('both','arrival','day2')),
  add column usual_arrival time not null default '16:00';
alter table public.locations alter column checkin_schedule set default 'both';
alter table public.orders add column expected_arrival time;
create table private.stay_issues (
  feedback_id uuid primary key references public.guest_feedback(id) on delete cascade,
  status text not null default 'New' check(status in ('New','In progress','Resolved'))
);
alter table private.stay_issues enable row level security;
revoke all on private.stay_issues from public,anon,authenticated;
grant usage on schema private to service_role;
grant select on private.stay_issues to service_role;
create function private.save_feedback_or_issue(
  p_mode text, p_target_id uuid, p_submission_id uuid, p_star_rating integer,
  p_feedback_text text, p_guest_name text, p_guest_email text, p_issue boolean
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
  if p_issue and (v_text is null or (p_mode='property' and v_email is null)) then
    return jsonb_build_object('status','invalid');
  end if;
  v_hash := sha256(convert_to(jsonb_build_array(p_star_rating, v_text, v_name, v_email)::text, 'UTF8'));
  if p_issue then v_hash := sha256(v_hash || convert_to('stay-issue','UTF8')); end if;
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
  -- An in-stay issue leaves the separate post-checkout review invitation eligible.
  if p_issue then
    insert into private.stay_issues(feedback_id) values(v_feedback);
  else
    update public.review_requests set status = 'private_feedback' where id = v_request;
  end if;
  insert into private.feedback_submission_receipts(submission_id, target_mode, target_id, location_id, payload_hash, feedback_id)
    values (p_submission_id, p_mode, p_target_id, v_location.location_id, v_hash, v_feedback);
  return jsonb_build_object('status', 'accepted', 'submission_id', p_submission_id);
end;
$$;
revoke all on function private.save_feedback_or_issue(text,uuid,uuid,integer,text,text,text,boolean) from public,anon,authenticated;
create or replace function guest_feedback_api.save_guest_feedback(p_mode text,p_target_id uuid,p_submission_id uuid,p_star_rating integer,p_feedback_text text,p_guest_name text,p_guest_email text)
returns jsonb language sql security definer set search_path='' as $$
 select private.save_feedback_or_issue(p_mode,p_target_id,p_submission_id,p_star_rating,p_feedback_text,p_guest_name,p_guest_email,false);
$$;
create function guest_feedback_api.report_issue(p_mode text,p_target_id uuid,p_submission_id uuid,p_message text,p_email text)
returns jsonb language sql security definer set search_path='' as $$
 select private.save_feedback_or_issue(p_mode,p_target_id,p_submission_id,null,p_message,null,p_email,true);
$$;
create function public.report_stay_issue(p_mode text,p_target_id uuid,p_submission_id uuid,p_message text,p_email text)
returns jsonb language sql security invoker set search_path='' as $$
 select guest_feedback_api.report_issue(p_mode,p_target_id,p_submission_id,p_message,p_email);
$$;
revoke all on function guest_feedback_api.report_issue(text,uuid,uuid,text,text),public.report_stay_issue(text,uuid,uuid,text,text) from public;
grant execute on function guest_feedback_api.report_issue(text,uuid,uuid,text,text),public.report_stay_issue(text,uuid,uuid,text,text) to authenticated,anon;
create function guest_feedback_api.issues(p_status text,p_id uuid,p_before timestamptz,p_offset int)
returns table(id uuid, property text, message text, contact text, reported timestamptz, status text)
language sql stable security definer set search_path='' as $$
 select f.id,l.name,f.feedback_text,coalesce(f.guest_email,c.email,c.phone),f.created_at,i.status
 from private.stay_issues i join public.guest_feedback f on f.id=i.feedback_id join public.locations l on l.id=f.location_id
 join public.users u on u.id=auth.uid() and u.account_id=l.account_id and u.role in ('admin','staff')
 left join public.review_requests r on r.id=f.request_id left join public.orders o on o.id=r.order_id and o.location_id=l.id
 left join public.customers c on c.id=o.customer_id and c.account_id=l.account_id
 where (p_id is null or f.id=p_id) and (p_status is null or i.status=p_status)
 and (p_before is null or f.created_at<=p_before) order by f.created_at desc,f.id limit 51 offset greatest(0,p_offset);
$$;
create function public.stay_issue_inbox(p_status text,p_id uuid,p_before timestamptz,p_offset int)
returns table(id uuid, property text, message text, contact text, reported timestamptz, status text)
language sql stable security invoker set search_path='' as $$ select * from guest_feedback_api.issues(p_status,p_id,p_before,p_offset); $$;
create function guest_feedback_api.change_issue(p_id uuid,p_status text) returns boolean
language sql security definer set search_path='' as $$
 with changed as (update private.stay_issues i set status=p_status from public.guest_feedback f,public.locations l,public.users u
 where i.feedback_id=p_id and f.id=i.feedback_id and l.id=f.location_id and u.id=auth.uid() and u.account_id=l.account_id and u.role in ('staff','admin') returning 1)
 select exists(select 1 from changed);
$$;
create function public.set_stay_issue_status(p_id uuid,p_status text) returns boolean language sql security invoker set search_path='' as $$select guest_feedback_api.change_issue(p_id,p_status);$$;
revoke all on function guest_feedback_api.issues(text,uuid,timestamptz,int),public.stay_issue_inbox(text,uuid,timestamptz,int),guest_feedback_api.change_issue(uuid,text),public.set_stay_issue_status(uuid,text) from public,anon;
grant execute on function guest_feedback_api.issues(text,uuid,timestamptz,int),public.stay_issue_inbox(text,uuid,timestamptz,int),guest_feedback_api.change_issue(uuid,text),public.set_stay_issue_status(uuid,text) to authenticated;
create or replace function public.message_send_is_due(
  p_order_id uuid, p_phase text, p_at timestamptz default now(), p_manual boolean default false
) returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare
  v record;
  v_local timestamp;
  v_checkout date;
  v_checkin date;
  v_day date;
  v_hour integer;
  v_arrival timestamp; v_due timestamp; v_next_run timestamp;
begin
  select o.status,o.source,o.checkin_date,o.checkout_date,l.timezone,
    l.preferred_send_hour,l.midstay_enabled,l.midstay_day,l.checkin_schedule,l.usual_arrival,o.expected_arrival,o.created_at
    into v from public.orders o join public.locations l on l.id=o.location_id where o.id=p_order_id;
  if not found or v.status is distinct from 'completed' or p_at is null
     or not isfinite(p_at) or p_phase is null or p_phase not in ('initial','reminder','midstay','arrival')
     or v.checkout_date is null or not isfinite(v.checkout_date) then return false; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name=coalesce(v.timezone,'UTC')) then
    return false; -- Bad timezone is held; never guess another local sending hour.
  end if;
  v_local := p_at at time zone coalesce(v.timezone,'UTC');
  v_checkout := (v.checkout_date at time zone 'UTC')::date;
  v_hour := coalesce(v.preferred_send_hour,10);
  if v_hour not between 0 and 23 then return false; end if;
  if v.source='reviewsail_test' and (p_manual is not true or p_phase<>'initial') then return false; end if;
  if p_phase in ('arrival','midstay') then
    if exists (select 1 from private.stay_issues i join public.guest_feedback f on f.id=i.feedback_id
       join public.review_requests r on r.id=f.request_id where r.order_id=p_order_id) then return false; end if;
    if p_phase='arrival' and v.checkin_schedule is null then return false; end if;
    if v.checkin_schedule is not null then
      v_checkin := (v.checkin_date at time zone 'UTC')::date;
      if v.midstay_enabled is false or v_checkin is null or v_local::date >= v_checkout
        or (v.created_at at time zone coalesce(v.timezone,'UTC'))::date > v_checkin then return false; end if;
      v_arrival := v_checkin + coalesce(v.expected_arrival,v.usual_arrival) + interval '2 hours';
      -- The worker runs at the top of each UTC hour. An arrival whose
      -- first eligible run falls in quiet hours rolls forward to the morning.
      v_next_run := v_arrival + make_interval(mins => (60 - extract(minute from
        ((v_arrival at time zone coalesce(v.timezone,'UTC')) at time zone 'UTC'))::int) % 60);
      if v_arrival::time >= time '20:00' or v_next_run::time >= time '20:00' then v_arrival := (v_arrival::date + 1) + time '09:00';
      elsif v_arrival::time < time '09:00' then v_arrival := v_arrival::date + time '09:00'; end if;
      if p_phase='arrival' then
        if v.checkin_schedule='day2' then return false; end if;
        v_due := v_arrival;
      else
        if v.checkin_schedule='arrival' or (v.checkin_schedule='both' and v_arrival::date>v_checkin) then return false; end if;
        v_due := (v_checkin+1) + time '12:00';
      end if;
      return v_local::date=v_due::date and v_local>=v_due and v_local::time<time '20:00';
    end if;
  end if;
  if p_phase in ('initial','reminder') then
    -- Automatic post-stay messages start the following property-local day.
    -- Explicit manual initial sends may still be sent on checkout day.
    if v_local::date < v_checkout or v_local::date > v_checkout+14 then return false; end if;
    if p_manual is true and p_phase='initial' then return true; end if;
    if v_local::date = v_checkout then return false; end if;
  else
    if v.midstay_enabled=false or v.checkin_date is null or not isfinite(v.checkin_date)
       or coalesce(v.midstay_day,2) not between 2 and 7 then return false; end if;
    v_checkin := (v.checkin_date at time zone 'UTC')::date;
    v_day := v_checkin + (coalesce(v.midstay_day,2)-1);
    -- At most one calendar day late, and never on/after departure day.
    if v_local::date < v_day or v_local::date > v_day+1 or v_local::date >= v_checkout then return false; end if;
  end if;
  -- Local wall-clock window; a skipped spring-forward hour catches up, and a
  -- repeated fall-back hour is safe because Step 3's attempt key never resets.
  return v_local >= v_local::date + make_interval(hours=>v_hour)
     and v_local < v_local::date + make_interval(hours=>least(v_hour+4,24));
end;
$$;
alter table public.message_send_attempts drop constraint message_send_attempts_phase_check, add check(phase in ('initial','reminder','midstay','arrival'));
create or replace function public.select_due_guest_messages(
  p_phase text, p_email_ready boolean, p_sms_ready boolean,
  p_limit integer default 50, p_at timestamptz default now()
) returns table(request_id uuid,order_id uuid) language sql stable security invoker set search_path = '' as $$
  with eligible as (
    select r.id as request_id,o.id as order_id,l.account_id,
      case when p_phase in ('midstay','arrival') then o.checkin_date else o.checkout_date end as stay_date
    from public.review_requests r
    join public.orders o on o.id=r.order_id
    join public.locations l on l.id=o.location_id
    join public.accounts a on a.id=l.account_id and a.subscription_status in ('active','trialing')
    join public.customers c on c.id=o.customer_id and c.account_id=l.account_id
    where o.status='completed' and o.source is distinct from 'reviewsail_test'
      and ((p_phase in ('initial','reminder') and o.checkout_date between p_at-interval '16 days' and p_at+interval '2 days')
        or (p_phase in ('midstay','arrival') and o.checkin_date between p_at-interval '10 days' and p_at+interval '2 days'))
      and ((p_phase='initial' and r.status='pending' and r.sent_at is null)
        or (p_phase='reminder' and r.status='sent' and r.sent_at < p_at-interval '72 hours')
        or (p_phase='arrival' and r.status='pending')
        or (p_phase='midstay' and r.status in ('pending','sent') and o.midstay_sent is not true))
      and public.message_send_is_due(o.id,p_phase,p_at,false)
      and not (p_phase in ('arrival','midstay') and l.checkin_schedule is not null and exists (
        select 1 from public.message_send_attempts m where m.order_id=o.id and m.phase=p_phase
      ))
      and not exists (select 1 from public.opt_outs oo where lower(btrim(oo.email))=lower(btrim(c.email)))
      and not exists (
        select 1 from public.message_events e join public.review_requests er on er.id=e.request_id
        where er.order_id=o.id and (e.event_type=case p_phase when 'initial' then 'sent'
          when 'reminder' then 'reminder_sent' when 'midstay' then 'midstay_checkin' end
          or (p_phase='reminder' and e.event_type='clicked'))
      )
      and not (p_phase='initial' and exists (select 1 from public.review_requests sr
        where sr.order_id=o.id and (sr.sent_at is not null or sr.status='sent')))
      and (
        (p_email_ready is true and l.enable_email is distinct from false and nullif(btrim(c.email),'') is not null
          and not exists (select 1 from public.message_send_attempts m where m.order_id=o.id and m.phase=p_phase and m.channel='email'))
        or
        (p_sms_ready is true and l.enable_sms is distinct from false and nullif(btrim(c.phone),'') is not null
          and not exists (select 1 from public.opt_outs oo where regexp_replace(oo.phone,'[^0-9]','','g')=regexp_replace(c.phone,'[^0-9]','','g'))
          and not exists (select 1 from public.message_send_attempts m where m.order_id=o.id and m.phase=p_phase and m.channel='sms'))
      )
  ), one_per_stay as (
    select distinct on (e.order_id) e.request_id,e.order_id,e.account_id,e.stay_date
    from eligible e order by e.order_id,e.request_id
  ), fair as (
    select e.request_id,e.order_id,e.account_id,e.stay_date,
      row_number() over (partition by e.account_id order by e.stay_date,e.order_id) as account_rank
    from one_per_stay e
  )
  select f.request_id,f.order_id from fair f
  order by f.account_rank,f.stay_date,f.account_id,f.order_id
  limit greatest(0,least(coalesce(p_limit,50),50));
$$;
create or replace function public.claim_message_send(
  p_order_id uuid, p_request_id uuid, p_phase text, p_channel text,
  p_claim_token uuid, p_destination text, p_manual boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order record;
  v_request record;
  v_location record;
  v_customer record;
  v_attempt record;
  v_event text;
begin
  if p_phase not in ('initial','reminder','midstay','arrival') or p_channel not in ('email','sms')
     or p_phase is null or p_channel is null or p_claim_token is null then
    raise exception 'Invalid sending key' using errcode = '22023';
  end if;
  select o.location_id,o.customer_id,o.source,o.midstay_sent into v_order
    from public.orders o where o.id=p_order_id for update;
  if not found then return jsonb_build_object('claimed',false,'reason','not_eligible'); end if;
  select r.status,r.sent_at into v_request from public.review_requests r
    where r.id=p_request_id and r.order_id=p_order_id for update;
  if not found or v_request.status not in ('pending','sent') then
    return jsonb_build_object('claimed',false,'reason','not_eligible');
  end if;
  if not public.message_send_is_due(p_order_id,p_phase,statement_timestamp(),p_manual) then
    return jsonb_build_object('claimed',false,'reason','not_eligible');
  end if;
  select l.account_id,l.enable_email,l.enable_sms,l.checkin_schedule into v_location from public.locations l where l.id=v_order.location_id;
  select c.account_id,c.email,c.phone into v_customer from public.customers c where c.id=v_order.customer_id;
  if v_customer.account_id is distinct from v_location.account_id
     or not exists (select 1 from public.accounts a where a.id=v_location.account_id
                    and a.subscription_status in ('active','trialing'))
     or (v_order.source='reviewsail_test' and (p_manual is not true or p_phase<>'initial')) then
    return jsonb_build_object('claimed',false,'reason','not_eligible');
  end if;
  -- Check live channel settings and suppression again, after candidate selection.
  if exists (select 1 from public.opt_outs oo
             where lower(btrim(oo.email))=lower(btrim(v_customer.email))) then
    return jsonb_build_object('claimed',false,'reason','not_eligible');
  end if;
  if p_channel='email' then
    if v_location.enable_email=false or nullif(btrim(v_customer.email),'') is null
       or p_destination is distinct from btrim(v_customer.email) then
      return jsonb_build_object('claimed',false,'reason','not_eligible');
    end if;
  else
    if v_location.enable_sms=false or nullif(btrim(v_customer.phone),'') is null
       or p_destination is distinct from btrim(v_customer.phone)
       or exists (select 1 from public.opt_outs oo where
         regexp_replace(oo.phone,'[^0-9]','','g')=regexp_replace(v_customer.phone,'[^0-9]','','g')) then
      return jsonb_build_object('claimed',false,'reason','not_eligible');
    end if;
  end if;

  select a.state,a.provider_id into v_attempt from public.message_send_attempts a
    where a.order_id=p_order_id and a.phase=p_phase and a.channel=p_channel;
  if found then
    return jsonb_build_object('claimed',false,'state',v_attempt.state,
      'providerId',v_attempt.provider_id,'reason',case when v_attempt.state='accepted'
        then 'already_accepted' else 'previous_attempt_requires_review' end);
  end if;
  -- A new check-in has one delivery channel per stay and phase. The order
  -- lock also covers concurrent workers choosing different destinations.
  if p_phase in ('arrival','midstay') and v_location.checkin_schedule is not null
     and exists (select 1 from public.message_send_attempts a where a.order_id=p_order_id and a.phase=p_phase) then
    return jsonb_build_object('claimed',false,'reason','another_channel_attempted');
  end if;
  -- Never resend historical records with no trustworthy per-channel evidence.
  -- Check all requests for the stay, including a recreated/duplicate request.
  v_event := case p_phase when 'initial' then 'sent' when 'reminder' then 'reminder_sent' when 'midstay' then 'midstay_checkin' end;
  if not exists (select 1 from public.message_send_attempts a where a.order_id=p_order_id and a.phase=p_phase)
     and ((p_phase='initial' and exists (select 1 from public.review_requests r
              where r.order_id=p_order_id and (r.sent_at is not null or r.status='sent')))
       or (p_phase='midstay' and v_order.midstay_sent)
       or exists (select 1 from public.message_events e join public.review_requests r on r.id=e.request_id
                  where r.order_id=p_order_id and e.event_type=v_event)) then
    return jsonb_build_object('claimed',false,'reason','historical_send_requires_review');
  end if;
  if p_phase='reminder' and (v_request.status<>'sent' or v_request.sent_at is null
      or v_request.sent_at >= now()-interval '3 days'
      or exists (select 1 from public.message_events e where e.request_id=p_request_id and e.event_type='clicked')) then
    return jsonb_build_object('claimed',false,'reason','not_eligible');
  end if;
  insert into public.message_send_attempts(order_id,request_id,phase,channel,claim_token)
    values(p_order_id,p_request_id,p_phase,p_channel,p_claim_token)
    on conflict (order_id,phase,channel) do nothing;
  return jsonb_build_object('claimed',found);
end;
$$;
create or replace function public.finish_message_send(
  p_order_id uuid, p_phase text, p_channel text, p_claim_token uuid,
  p_state text, p_provider_id text default null, p_reason text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt record;
  v_first_acceptance boolean;
  v_event text;
begin
  if p_state is null or p_state not in ('accepted','rejected','unknown')
     or (p_state='accepted' and nullif(btrim(p_provider_id),'') is null) then
    raise exception 'Invalid provider outcome' using errcode = '22023';
  end if;
  -- Same lock ordering as claim; serializes the two channel completions.
  perform 1 from public.orders o where o.id=p_order_id for update;
  if not found then return false; end if;
  select a.claim_token,a.state,a.provider_id,a.request_id into v_attempt from public.message_send_attempts a
    where a.order_id=p_order_id and a.phase=p_phase and a.channel=p_channel for update;
  if not found or v_attempt.claim_token is distinct from p_claim_token then return false; end if;
  if v_attempt.state<>'started' then
    return v_attempt.state=p_state and v_attempt.provider_id is not distinct from p_provider_id;
  end if;
  v_first_acceptance := not exists (select 1 from public.message_send_attempts a
    where a.order_id=p_order_id and a.phase=p_phase and a.state='accepted');
  update public.message_send_attempts set state=p_state, provider_id=p_provider_id,
    reason=p_reason, finished_at=now()
    where order_id=p_order_id and phase=p_phase and channel=p_channel;
  if p_state='accepted' then
    if p_phase='initial' then
      -- Never undo a guest response/opt-out committed while the HTTP call ran.
      update public.review_requests set status='sent', sent_at=coalesce(sent_at,now())
        where id=v_attempt.request_id and status in ('pending','sent');
    elsif p_phase='midstay' then
      update public.orders set midstay_sent=true, midstay_sent_at=coalesce(midstay_sent_at,now())
        where id=p_order_id;
    end if;
    if p_phase<>'arrival' and v_first_acceptance and v_attempt.request_id is not null then
      v_event := case p_phase when 'initial' then 'sent' when 'reminder' then 'reminder_sent' when 'midstay' then 'midstay_checkin' end;
      insert into public.message_events(request_id,event_type) values(v_attempt.request_id,v_event);
    end if;
  end if;
  return true;
end;
$$;
create or replace function owner_alert_api.claim(p_state text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job record; v_email text; v_property text;
begin
  if p_state is null or p_state not in ('ready','disabled','configuration_missing') then raise exception 'Invalid worker state'; end if;
  insert into owner_alert_api.worker_health(singleton,checked_at,state) values(true,now(),p_state)
    on conflict(singleton) do update set checked_at=excluded.checked_at,state=excluded.state;
  -- Never reclaim a started job: a lost provider/DB response is ambiguous.
  update owner_alert_api.jobs set status='uncertain',reason='worker_interrupted',finished_at=now()
    where status='processing' and started_at<now()-interval '5 minutes';
  if p_state<>'ready' then return null; end if;
  -- The health-row upsert serializes this global spacing check across workers.
  if exists(select 1 from owner_alert_api.jobs where started_at>now()-interval '1 second') then return null; end if;
  -- One locked job per call; concurrent workers cannot claim the same row.
  select j.id,j.feedback_id,j.recipient_id,j.account_id,j.created_at into v_job
    from owner_alert_api.jobs j where j.status='queued' order by j.created_at,j.id
    for update skip locked limit 1;
  if not found then return null; end if;
  -- Serialize per-recipient rate accounting, even with concurrent workers.
  perform pg_advisory_xact_lock(hashtextextended(v_job.recipient_id::text,7911));
  select a.email,left(coalesce(nullif(btrim(l.name),''),'Your property'),200) into v_email,v_property
    from owner_alert_api.preferences p
    join public.users u on u.id=p.user_id and u.role='admin' and u.account_id=p.account_id
    join auth.users a on a.id=u.id and a.email_confirmed_at is not null and nullif(a.email,'') is not null
    join public.guest_feedback f on f.id=v_job.feedback_id
    join public.locations l on l.id=f.location_id and l.account_id=p.account_id
    where p.user_id=v_job.recipient_id and p.account_id=v_job.account_id and p.enabled;
  if v_email is null then
    update owner_alert_api.jobs set status='cancelled',reason='recipient_ineligible',finished_at=now() where id=v_job.id;
    return jsonb_build_object('skipped',true);
  end if;
  if v_job.created_at<now()-interval '24 hours' then
    update owner_alert_api.jobs set status='failed',reason='expired',finished_at=now() where id=v_job.id;
    return jsonb_build_object('skipped',true);
  end if;
  if (select count(*) from owner_alert_api.jobs where recipient_id=v_job.recipient_id and started_at>now()-interval '24 hours')>=50 then
    update owner_alert_api.jobs set status='failed',reason='daily_limit',finished_at=now() where id=v_job.id;
    return jsonb_build_object('skipped',true);
  end if;
  update owner_alert_api.jobs set status='processing',started_at=now(),claim_token=gen_random_uuid() where id=v_job.id;
  return (select jsonb_build_object('id',j.id,'token',j.claim_token,'email',v_email,'property',v_property,'issueId',(select i.feedback_id from private.stay_issues i where i.feedback_id=j.feedback_id)) from owner_alert_api.jobs j where j.id=v_job.id);
end;
$$;
create or replace function public.import_guest_batch(p_location_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_account uuid;
  v_row jsonb;
  v_index integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_first text; v_last text; v_email text; v_phone text; v_contact text;
  v_source text; v_ref text; v_key text;
  v_status text; v_blocked_refs text[];
  v_checkout date; v_checkin date;
  v_customer uuid; v_order uuid; v_existing record;
  v_existing_email text; v_existing_phone text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select l.account_id into v_account from public.locations l
    join public.users u on u.account_id = l.account_id
    where l.id = p_location_id and u.id = auth.uid();
  if v_account is null then
    raise exception 'Property is not accessible' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Expected an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 or octet_length(p_rows::text) > 524288 then
    raise exception 'Import batch is too large' using errcode = '22023';
  end if;

  -- Serialize imports for this property, including checks against legacy stays.
  -- Short, bounded transaction; no HTTP calls or provider side effects here.
  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text, 7281));
  -- Independently validate supplied statuses, including contradictory copies
  -- of a reference in this batch. The client checks across all batches too.
  select coalesce(array_agg(jsonb_build_array(coalesce(nullif(r->>'source', ''), 'direct'), btrim(r->>'externalReference'))::text), '{}'::text[])
    into v_blocked_refs from jsonb_array_elements(p_rows) r
    where nullif(btrim(r->>'externalReference'), '') is not null
      and r->>'reservationStatus' is not null
      and regexp_replace(lower(btrim(r->>'reservationStatus')), '[[:space:]_-]+', '', 'g')
        not in ('confirmed', 'ok', 'booked', 'accepted', 'completed', 'checkedin', 'checkedout');
  for v_row in select value from jsonb_array_elements(p_rows) loop
    begin
      if jsonb_typeof(v_row) <> 'object' then raise invalid_parameter_value; end if;
      v_first := btrim(coalesce(v_row->>'firstName', ''));
      v_last := btrim(coalesce(v_row->>'lastName', ''));
      v_email := nullif(lower(btrim(v_row->>'email')), '');
      v_phone := nullif(regexp_replace(v_row->>'phone', '[^0-9]', '', 'g'), '');
      v_ref := nullif(btrim(v_row->>'externalReference'), '');
      v_source := coalesce(nullif(v_row->>'source', ''), 'direct');
      v_status := regexp_replace(lower(btrim(v_row->>'reservationStatus')), '[[:space:]_-]+', '', 'g');
      if (v_status is not null and v_status not in ('confirmed', 'ok', 'booked', 'accepted', 'completed', 'checkedin', 'checkedout'))
        or (v_ref is not null and jsonb_build_array(v_source, v_ref)::text = any(v_blocked_refs)) then
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed',
          'reason', 'Booking status is ineligible, unrecognized or conflicting. Nothing was created; previously imported stays were not changed.'));
        v_index := v_index + 1;
        continue;
      end if;
      if v_first = '' and v_last = '' then raise invalid_parameter_value; end if;
      if length(v_first) > 200 or length(v_last) > 200 or length(v_email) > 320
        or length(v_phone) > 15 or length(v_ref) > 200 then raise invalid_parameter_value; end if;
      if v_email is null and v_phone is null then raise invalid_parameter_value; end if;
      if (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
        or (v_phone is not null and length(v_phone) < 7) then raise invalid_parameter_value; end if;
      if v_source not in ('direct', 'airbnb', 'booking_com', 'other') then raise invalid_parameter_value; end if;
      if coalesce(v_row->>'checkoutDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or (nullif(v_row->>'checkinDate', '') is not null and (v_row->>'checkinDate') !~ '^\d{4}-\d{2}-\d{2}$')
        then raise invalid_parameter_value; end if;
      v_checkout := (v_row->>'checkoutDate')::date;
      v_checkin := nullif(v_row->>'checkinDate', '')::date;
      if nullif(v_row->>'expectedArrival','') is not null and
        (v_checkin is null or v_row->>'expectedArrival' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise invalid_parameter_value; end if;
      if v_checkin > v_checkout then raise invalid_parameter_value; end if;
      v_contact := coalesce(v_email, v_phone);
      v_key := case when v_ref is not null
        then jsonb_build_array('reference', v_source, v_ref)::text
        else jsonb_build_array('contact', v_contact, v_checkout)::text end;

      -- EGRESS-COST: low — database-side lookup, one outcome per input row.
      -- No browser-wide history fetch or 2,000-row deduplication ceiling.
      select o.id, o.checkout_date, o.checkin_date, o.expected_arrival, o.customer_id, o.external_reference into v_existing from public.orders o
        where o.location_id = p_location_id and o.import_key = v_key;
      if not found then
        select o.id, o.checkout_date, o.checkin_date, o.expected_arrival, o.customer_id, o.external_reference into v_existing from public.orders o
          join public.customers c on c.id = o.customer_id
          where o.location_id = p_location_id and c.account_id = v_account
            and (o.checkout_date at time zone 'UTC')::date = v_checkout
            and coalesce(nullif(lower(btrim(c.email)), ''), nullif(regexp_replace(c.phone, '[^0-9]', '', 'g'), '')) = v_contact
            and (v_ref is null or o.external_reference is null)
          order by o.id limit 1;
      end if;
      if v_existing.id is not null then
        select nullif(lower(btrim(c.email)), ''), nullif(regexp_replace(c.phone, '[^0-9]', '', 'g'), '')
          into v_existing_email, v_existing_phone from public.customers c where c.id = v_existing.customer_id;
        if (v_existing.checkout_date at time zone 'UTC')::date is distinct from v_checkout
          or (v_existing.checkin_date at time zone 'UTC')::date is distinct from v_checkin
          or (nullif(v_row->>'expectedArrival','') is not null and v_existing.expected_arrival is distinct from (v_row->>'expectedArrival')::time)
          or v_existing_email is distinct from v_email or v_existing_phone is distinct from v_phone then
          v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed',
            'reason', 'Existing stay has different dates or contact details. Review it manually; nothing was changed.'));
        else
          -- Attach a newly supplied reference to an unchanged legacy stay only.
          if v_ref is not null and v_existing.external_reference is null then
            update public.orders set import_key = v_key, external_reference = v_ref where id = v_existing.id;
          end if;
          v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'duplicate'));
        end if;
      else
        insert into public.customers(account_id, first_name, last_name, email, phone)
          values (v_account, v_first, v_last, v_email, nullif(btrim(v_row->>'phone'), '')) returning id into v_customer;
        insert into public.orders(location_id, customer_id, checkout_date, checkin_date, expected_arrival, source, status, import_key, external_reference)
          values (p_location_id, v_customer, v_checkout::timestamp at time zone 'UTC', v_checkin::timestamp at time zone 'UTC',
            nullif(v_row->>'expectedArrival','')::time, v_source, 'completed', v_key, v_ref) returning id into v_order;
        -- Existing suppression trigger still applies. No contact list is exposed.
        insert into public.review_requests(order_id, status) values (v_order, 'pending');
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'imported'));
      end if;
    exception
      when invalid_parameter_value or invalid_datetime_format or datetime_field_overflow then
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed', 'reason', 'Invalid name, contact, source, reference or stay dates.'));
      when others then
        -- This block rolls back ALL writes for this row, not earlier rows.
        -- Never return raw SQL errors containing guest data.
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed', 'reason', 'Could not save this stay. No partial guest or request was kept for this row.'));
    end;
    v_index := v_index + 1;
  end loop;
  return v_results;
end;
$$;
commit;
