-- One irreversible provider attempt per account/recipient/reporting period.
-- A started/uncertain attempt is never reclaimed automatically: the provider
-- could have accepted it before the worker or database acknowledgement failed.
begin;

create table public.digest_send_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  frequency text not null check (frequency in ('weekly','monthly')),
  period_key date not null,
  claim_token uuid not null unique,
  state text not null default 'started' check (state in ('started','accepted','rejected','uncertain')),
  reason text check (reason in ('provider_rejected','provider_ambiguous','transport_interrupted','invalid_receipt')),
  provider_id text check (char_length(provider_id) <= 200),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint digest_send_attempts_once unique (account_id,recipient_id,frequency,period_key),
  constraint digest_send_attempts_shape check (
    (state='started' and finished_at is null and provider_id is null and reason is null)
    or (state='accepted' and finished_at is not null and nullif(btrim(provider_id),'') is not null and reason is null)
    or (state in ('rejected','uncertain') and finished_at is not null and provider_id is null and reason is not null)
  )
);
create index digest_send_attempts_recipient_idx on public.digest_send_attempts(recipient_id,started_at desc);
alter table public.digest_send_attempts enable row level security;
revoke all on public.digest_send_attempts from public,anon,authenticated,service_role;
grant select,insert,update on public.digest_send_attempts to service_role;
comment on table public.digest_send_attempts is
  'Service-only digest replay guard. No email address or message body. Never delete or reset an uncertain attempt to force a resend.';

-- SECURITY INVOKER plus an explicit service-role EXECUTE grant. The user and
-- digest preference are rechecked immediately before the provider attempt.
create function public.claim_digest_send_v1(
  p_account_id uuid,p_recipient_id uuid,p_frequency text,p_period_key date,
  p_email text,p_claim_token uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_state text;
begin
  if p_account_id is null or p_recipient_id is null or p_period_key is null
     or p_claim_token is null or nullif(btrim(p_email),'') is null
     or p_frequency is null or p_frequency not in ('weekly','monthly') then
    raise exception 'Invalid digest claim' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.users u
    left join public.digest_settings s on s.user_id=u.id
    where u.id=p_recipient_id and u.account_id=p_account_id
      and u.role in ('admin','owner') and u.email=p_email
      and ((s.user_id is null and p_frequency='weekly')
        or (s.account_id=p_account_id and s.enabled=true and s.frequency=p_frequency))
  ) then
    return jsonb_build_object('claimed',false,'reason','recipient_ineligible');
  end if;
  insert into public.digest_send_attempts(
    account_id,recipient_id,frequency,period_key,claim_token
  ) values (
    p_account_id,p_recipient_id,p_frequency,p_period_key,p_claim_token
  ) on conflict on constraint digest_send_attempts_once do nothing
  returning id into v_id;
  if v_id is null then
    select state into v_state from public.digest_send_attempts
      where account_id=p_account_id and recipient_id=p_recipient_id
        and frequency=p_frequency and period_key=p_period_key;
    return jsonb_build_object('claimed',false,'reason','already_claimed','state',v_state);
  end if;
  return jsonb_build_object('claimed',true,'id',v_id);
end;
$$;

create function public.finish_digest_send_v1(
  p_id uuid,p_token uuid,p_state text,p_reason text default null,p_provider_id text default null
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_changed integer;
begin
  if p_id is null or p_token is null or p_state is null
     or p_state not in ('accepted','rejected','uncertain') then
    raise exception 'Invalid digest outcome' using errcode='22023';
  end if;
  if (p_state='accepted' and (nullif(btrim(p_provider_id),'') is null or p_reason is not null))
     or (p_state<>'accepted' and (p_provider_id is not null
       or p_reason is null or p_reason not in
         ('provider_rejected','provider_ambiguous','transport_interrupted','invalid_receipt'))) then
    raise exception 'Invalid digest receipt' using errcode='22023';
  end if;
  update public.digest_send_attempts
    set state=p_state,reason=p_reason,provider_id=p_provider_id,finished_at=now()
    where id=p_id and claim_token=p_token and state='started';
  get diagnostics v_changed=row_count;
  return v_changed=1;
end;
$$;

revoke all on function public.claim_digest_send_v1(uuid,uuid,text,date,text,uuid),
  public.finish_digest_send_v1(uuid,uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_digest_send_v1(uuid,uuid,text,date,text,uuid),
  public.finish_digest_send_v1(uuid,uuid,text,text,text) to service_role;

commit;
