-- Step 3: one provider attempt per stay / purpose / channel. No expiring lease:
-- a crashed worker may already have contacted the provider. Never reclaim it
-- automatically. This deliberately trades automatic retries for duplicate safety.
begin;
create table public.message_send_attempts (
  order_id uuid not null references public.orders(id) on delete cascade,
  phase text not null check (phase in ('initial', 'reminder', 'midstay')),
  channel text not null check (channel in ('email', 'sms')),
  request_id uuid references public.review_requests(id) on delete set null,
  claim_token uuid not null unique,
  state text not null default 'started' check (state in ('started', 'accepted', 'rejected', 'unknown')),
  provider_id text,
  reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (order_id, phase, channel),
  check (state <> 'accepted' or nullif(btrim(provider_id), '') is not null)
);
create index message_send_attempts_request_idx on public.message_send_attempts(request_id);
alter table public.message_send_attempts enable row level security;
revoke all on public.message_send_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.message_send_attempts to service_role;
comment on table public.message_send_attempts is
  'Server-only duplicate guard. No addresses or message bodies. Never delete/reset attempts to retry an uncertain send. Order deletion cascades; request deletion preserves the stay-level guard.';

-- Both RPCs are SECURITY INVOKER, executable ONLY by the existing service role.
-- All locks are short database transactions, never held over provider HTTP calls.
create function public.claim_message_send(
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

create function public.finish_message_send(
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
    if v_first_acceptance and v_attempt.request_id is not null then
      v_event := case p_phase when 'initial' then 'sent' when 'reminder' then 'reminder_sent' else 'midstay_checkin' end;
      insert into public.message_events(request_id,event_type) values(v_attempt.request_id,v_event);
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.claim_message_send(uuid,uuid,text,text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.finish_message_send(uuid,text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_message_send(uuid,uuid,text,text,uuid,text,boolean) to service_role;
grant execute on function public.finish_message_send(uuid,text,text,uuid,text,text,text) to service_role;
commit;
