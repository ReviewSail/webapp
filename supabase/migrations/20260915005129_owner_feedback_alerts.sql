begin;
-- Keep this schema OUT of the Data API exposed-schema list. Definers below
-- need private queue / verified auth-email access; public wrappers are invokers.
create schema owner_alert_api;
revoke all on schema owner_alert_api from public, anon, authenticated;
grant usage on schema owner_alert_api to authenticated, service_role;

create table owner_alert_api.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table owner_alert_api.jobs (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.guest_feedback(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  status text not null default 'queued' check (status in ('queued','processing','accepted','failed','uncertain','cancelled')),
  reason text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  claim_token uuid,
  provider_id text,
  unique(feedback_id, recipient_id)
);
create index owner_alert_preferences_enabled on owner_alert_api.preferences(account_id,user_id) where enabled;
create index owner_alert_jobs_pending on owner_alert_api.jobs(created_at,id) where status='queued';
create index owner_alert_jobs_recipient on owner_alert_api.jobs(recipient_id,account_id,created_at desc,id desc);
create index owner_alert_jobs_attempts on owner_alert_api.jobs(recipient_id,started_at) where started_at is not null;
create index owner_alert_jobs_started on owner_alert_api.jobs(started_at desc) where started_at is not null;
create index owner_alert_jobs_attention on owner_alert_api.jobs(recipient_id,account_id,status,created_at)
  where status in ('failed','uncertain','queued','processing');
create table owner_alert_api.worker_health (
  singleton boolean primary key default true check(singleton),
  checked_at timestamptz not null,
  state text not null check(state in ('ready','disabled','configuration_missing'))
);
alter table owner_alert_api.preferences enable row level security;
alter table owner_alert_api.jobs enable row level security;
alter table owner_alert_api.worker_health enable row level security;
revoke all on all tables in schema owner_alert_api from public, anon, authenticated, service_role;

create function owner_alert_api.enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Trigger-only capability, intentionally accepts anonymous guest submissions.
  -- No network in the transaction: feedback and its outbox jobs commit together.
  insert into owner_alert_api.jobs(feedback_id,recipient_id,account_id)
    select new.id,p.user_id,p.account_id
    from owner_alert_api.preferences p
    join public.locations l on l.id=new.location_id and l.account_id=p.account_id
    join public.users u on u.id=p.user_id and u.account_id=p.account_id and u.role='admin'
    join auth.users a on a.id=p.user_id and a.email_confirmed_at is not null and nullif(a.email,'') is not null
    where p.enabled
    on conflict(feedback_id,recipient_id) do nothing;
  return new;
end;
$$;
revoke all on function owner_alert_api.enqueue() from public, anon, authenticated, service_role;
create trigger enqueue_owner_feedback_alert after insert on public.guest_feedback
  for each row when (new.kind='recovery' or new.star_rating between 1 and 3)
  execute function owner_alert_api.enqueue();

create function owner_alert_api.set_preference(p_enabled boolean,p_account_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_account uuid; v_email text;
begin
  if auth.uid() is null or p_enabled is null then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  select u.account_id,case when a.email_confirmed_at is not null then nullif(a.email,'') end
    into v_account,v_email from public.users u join auth.users a on a.id=u.id
    where u.id=auth.uid() and u.role='admin';
  if v_account is null then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_account_id is distinct from v_account then raise exception 'Account changed; refresh first' using errcode='42501'; end if;
  if p_enabled and v_email is null then raise exception 'Verify your sign-in email first' using errcode='22023'; end if;
  insert into owner_alert_api.preferences(user_id,account_id,enabled)
    values(auth.uid(),v_account,p_enabled)
    on conflict(user_id) do update set account_id=excluded.account_id,enabled=excluded.enabled,updated_at=now();
  -- Disabling stops unclaimed work. A provider request already in flight cannot
  -- be recalled. Moving accounts must not revive old-account jobs either.
  update owner_alert_api.jobs set status='cancelled',reason='preference_changed',finished_at=now()
    where recipient_id=auth.uid() and status='queued' and (not p_enabled or account_id<>v_account);
  return jsonb_build_object('enabled',p_enabled,'accountId',v_account);
end;
$$;

create function owner_alert_api.get_status(p_known_version text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_account uuid; v_email text; v_enabled boolean; v_data jsonb; v_version text;
begin
  if auth.uid() is null then raise exception 'Owner access required' using errcode='42501'; end if;
  select u.account_id,case when a.email_confirmed_at is not null then nullif(a.email,'') end
    into v_account,v_email from public.users u join auth.users a on a.id=u.id
    where u.id=auth.uid() and u.role='admin';
  if v_account is null then raise exception 'Owner access required' using errcode='42501'; end if;
  select p.enabled into v_enabled from owner_alert_api.preferences p where p.user_id=auth.uid() and p.account_id=v_account;
  select jsonb_build_object('accountId',v_account,'email',v_email,'enabled',coalesce(v_enabled,false),
    'worker',coalesce((select jsonb_build_object('state',h.state,'checkedAt',h.checked_at) from owner_alert_api.worker_health h),'null'::jsonb),
    'attentionCount',(select count(*) from owner_alert_api.jobs j where j.recipient_id=auth.uid() and j.account_id=v_account
      and (j.status in ('failed','uncertain') or (j.status in ('queued','processing') and j.created_at<now()-interval '10 minutes'))),
    'recent',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'property',left(coalesce(nullif(btrim(l.name),''),'Your property'),200),'status',j.status,'reason',j.reason,'createdAt',j.created_at) order by j.created_at desc,j.id desc)
      from (select id,feedback_id,status,reason,created_at from owner_alert_api.jobs where recipient_id=auth.uid() and account_id=v_account order by created_at desc,id desc limit 10) j
      join public.guest_feedback f on f.id=j.feedback_id join public.locations l on l.id=f.location_id and l.account_id=v_account),'[]'::jsonb)) into v_data;
  v_version:=encode(sha256(convert_to(v_data::text,'UTF8')),'hex');
  return jsonb_build_object('version',v_version,'data',case when p_known_version=v_version then null else v_data end);
end;
$$;

-- Worker capabilities are service-role only. They intentionally have no
-- end-user auth.uid(): cron authenticates in the Edge Function before any RPC.
create function owner_alert_api.claim(p_state text) returns jsonb
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
  return (select jsonb_build_object('id',j.id,'token',j.claim_token,'email',v_email,'property',v_property) from owner_alert_api.jobs j where j.id=v_job.id);
end;
$$;

create function owner_alert_api.finish(p_id uuid,p_token uuid,p_status text,p_reason text,p_provider_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_changed integer;
begin
  if p_status is null or p_status not in ('accepted','failed','uncertain') then raise exception 'Invalid outcome'; end if;
  if p_status='accepted' and nullif(btrim(p_provider_id),'') is null then raise exception 'Missing provider acknowledgement'; end if;
  if p_reason is not null and p_reason not in ('provider_rejected','provider_ambiguous','transport_interrupted') then raise exception 'Invalid reason'; end if;
  update owner_alert_api.jobs set status=p_status,reason=p_reason,provider_id=left(p_provider_id,200),finished_at=now()
    where id=p_id and claim_token=p_token and status='processing';
  get diagnostics v_changed=row_count;
  return v_changed=1;
end;
$$;

revoke all on all functions in schema owner_alert_api from public,anon,authenticated,service_role;
grant execute on function owner_alert_api.set_preference(boolean,uuid),owner_alert_api.get_status(text) to authenticated;
grant execute on function owner_alert_api.claim(text),owner_alert_api.finish(uuid,uuid,text,text,text) to service_role;

create function public.set_owner_alert_preference_v1(p_enabled boolean,p_account_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select owner_alert_api.set_preference(p_enabled,p_account_id) $$;
create function public.get_owner_alert_status_v1(p_known_version text default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select owner_alert_api.get_status(p_known_version) $$;
create function public.claim_owner_alert_v1(p_state text) returns jsonb
language sql security invoker set search_path='' as $$ select owner_alert_api.claim(p_state) $$;
create function public.finish_owner_alert_v1(p_id uuid,p_token uuid,p_status text,p_reason text default null,p_provider_id text default null) returns boolean
language sql security invoker set search_path='' as $$ select owner_alert_api.finish(p_id,p_token,p_status,p_reason,p_provider_id) $$;
revoke all on function public.set_owner_alert_preference_v1(boolean,uuid),public.get_owner_alert_status_v1(text),public.claim_owner_alert_v1(text),public.finish_owner_alert_v1(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.set_owner_alert_preference_v1(boolean,uuid),public.get_owner_alert_status_v1(text) to authenticated;
grant execute on function public.claim_owner_alert_v1(text),public.finish_owner_alert_v1(uuid,uuid,text,text,text) to service_role;
-- No historical backfill and no cron installation / activation in this migration.
commit;
