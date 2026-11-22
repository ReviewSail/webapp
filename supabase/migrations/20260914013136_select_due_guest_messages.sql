-- Step 4: filter due/usable work BEFORE LIMIT; never page through all guest data.
begin;

create function public.message_send_is_due(
  p_order_id uuid, p_phase text, p_at timestamptz default now(), p_manual boolean default false
) returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare
  v record;
  v_local timestamp;
  v_checkout date;
  v_checkin date;
  v_day date;
  v_hour integer;
begin
  select o.status,o.source,o.checkin_date,o.checkout_date,l.timezone,
    l.preferred_send_hour,l.midstay_enabled,l.midstay_day
    into v from public.orders o join public.locations l on l.id=o.location_id where o.id=p_order_id;
  if not found or v.status is distinct from 'completed' or p_at is null
     or not isfinite(p_at) or p_phase is null or p_phase not in ('initial','reminder','midstay')
     or v.checkout_date is null or not isfinite(v.checkout_date) then return false; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name=coalesce(v.timezone,'UTC')) then
    return false; -- Bad timezone is held; never guess another local sending hour.
  end if;
  v_local := p_at at time zone coalesce(v.timezone,'UTC');
  v_checkout := (v.checkout_date at time zone 'UTC')::date;
  v_hour := coalesce(v.preferred_send_hour,10);
  if v_hour not between 0 and 23 then return false; end if;
  if v.source='reviewsail_test' and (p_manual is not true or p_phase<>'initial') then return false; end if;
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

create function public.select_due_guest_messages(
  p_phase text, p_email_ready boolean, p_sms_ready boolean,
  p_limit integer default 50, p_at timestamptz default now()
) returns table(request_id uuid,order_id uuid) language sql stable security invoker set search_path = '' as $$
  with eligible as (
    select r.id as request_id,o.id as order_id,l.account_id,
      case when p_phase='midstay' then o.checkin_date else o.checkout_date end as stay_date
    from public.review_requests r
    join public.orders o on o.id=r.order_id
    join public.locations l on l.id=o.location_id
    join public.accounts a on a.id=l.account_id and a.subscription_status in ('active','trialing')
    join public.customers c on c.id=o.customer_id and c.account_id=l.account_id
    where o.status='completed' and o.source is distinct from 'reviewsail_test'
      and ((p_phase in ('initial','reminder') and o.checkout_date between p_at-interval '16 days' and p_at+interval '2 days')
        or (p_phase='midstay' and o.checkin_date between p_at-interval '10 days' and p_at+interval '2 days'))
      and ((p_phase='initial' and r.status='pending' and r.sent_at is null)
        or (p_phase='reminder' and r.status='sent' and r.sent_at < p_at-interval '72 hours')
        or (p_phase='midstay' and r.status in ('pending','sent') and o.midstay_sent is not true))
      and public.message_send_is_due(o.id,p_phase,p_at,false)
      and not exists (select 1 from public.opt_outs oo where lower(btrim(oo.email))=lower(btrim(c.email)))
      and not exists (
        select 1 from public.message_events e join public.review_requests er on er.id=e.request_id
        where er.order_id=o.id and (e.event_type=case p_phase when 'initial' then 'sent'
          when 'reminder' then 'reminder_sent' else 'midstay_checkin' end
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

-- Recheck the same timing policy under the existing short order/request locks.
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
  if p_phase not in ('initial','reminder','midstay') or p_channel not in ('email','sms')
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
  select l.account_id,l.enable_email,l.enable_sms into v_location from public.locations l where l.id=v_order.location_id;
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
  -- Never resend historical records with no trustworthy per-channel evidence.
  -- Check all requests for the stay, including a recreated/duplicate request.
  v_event := case p_phase when 'initial' then 'sent' when 'reminder' then 'reminder_sent' else 'midstay_checkin' end;
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

create index review_requests_send_candidates_idx on public.review_requests(status,order_id,sent_at)
  where status in ('pending','sent');
create index orders_poststay_schedule_idx on public.orders(checkout_date)
  where status='completed' and checkout_date is not null;
create index message_events_send_exclusions_idx on public.message_events(request_id,event_type)
  where event_type in ('sent','reminder_sent','midstay_checkin','clicked');

revoke all on function public.message_send_is_due(uuid,text,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.select_due_guest_messages(text,boolean,boolean,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.claim_message_send(uuid,uuid,text,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.message_send_is_due(uuid,text,timestamptz,boolean) to service_role;
grant execute on function public.select_due_guest_messages(text,boolean,boolean,integer,timestamptz) to service_role;
grant execute on function public.claim_message_send(uuid,uuid,text,text,uuid,text,boolean) to service_role;
commit;
