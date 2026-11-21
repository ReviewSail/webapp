begin;
create table public.billing_checkout_attempts (
  account_id uuid primary key references public.accounts(id),
  operation_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id text,
  session_id text,
  request_snapshot jsonb not null
);
alter table public.billing_checkout_attempts enable row level security;
revoke all on public.billing_checkout_attempts from public,anon,authenticated;
grant select,insert,update on public.billing_checkout_attempts to service_role;

create function public.prepare_billing_checkout(
  p_account_id uuid,p_actor_id uuid,p_email text,p_app_url text,p_expired_operation uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a record; c record;
begin
  select id,name,stripe_customer_id,stripe_subscription_id,subscription_status into a
    from public.accounts where id=p_account_id for update;
  if not found or not exists (select 1 from public.users where id=p_actor_id
    and account_id=p_account_id and role='admin') then raise exception 'Checkout not authorized'; end if;
  if coalesce(a.subscription_status,'inactive') not in ('inactive','canceled','trialing')
    or (a.subscription_status='trialing' and a.stripe_subscription_id is not null) then
    return jsonb_build_object('blocked',true);
  end if;
  select operation_id,created_at,customer_id,session_id,request_snapshot into c
    from public.billing_checkout_attempts where account_id=p_account_id;
  -- Only the server may attest that Stripe returned status=expired for the
  -- exact stored session. A timer alone must never recycle an unknown attempt.
  if found and c.operation_id=p_expired_operation and c.session_id is not null then
    update public.billing_checkout_attempts set operation_id=gen_random_uuid(),created_at=now(),
      customer_id=a.stripe_customer_id,session_id=null,
      request_snapshot=jsonb_build_object('name',a.name,'email',p_email,'app_url',p_app_url)
      where account_id=p_account_id;
  elsif not found then
    insert into public.billing_checkout_attempts(account_id,customer_id,request_snapshot)
      values(p_account_id,a.stripe_customer_id,jsonb_build_object('name',a.name,'email',p_email,'app_url',p_app_url));
  end if;
  select operation_id,created_at,customer_id,session_id,request_snapshot into c
    from public.billing_checkout_attempts where account_id=p_account_id;
  return jsonb_build_object('operation_id',c.operation_id,'created_at',c.created_at,
    'customer_id',c.customer_id,'session_id',c.session_id,'snapshot',c.request_snapshot,
    'subscription_id',a.stripe_subscription_id);
end;
$$;

create function public.record_billing_checkout(
  p_account_id uuid,p_actor_id uuid,p_operation_id uuid,p_customer_id text,p_session_id text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare a record; c record;
begin
  select stripe_customer_id,subscription_status,stripe_subscription_id into a
    from public.accounts where id=p_account_id for update;
  if not found or not exists(select 1 from public.users where id=p_actor_id and account_id=p_account_id and role='admin') then
    raise exception 'Checkout not authorized'; end if;
  select operation_id,customer_id,session_id into c from public.billing_checkout_attempts where account_id=p_account_id;
  if not found or c.operation_id is distinct from p_operation_id
    or nullif(p_customer_id,'') is null
    or (a.stripe_customer_id is not null and a.stripe_customer_id<>p_customer_id)
    or (c.customer_id is not null and c.customer_id<>p_customer_id)
    or (c.session_id is not null and p_session_id is not null and c.session_id<>p_session_id) then
    raise exception 'Checkout identity changed'; end if;
  if coalesce(a.subscription_status,'inactive') not in ('inactive','canceled','trialing')
    or (a.subscription_status='trialing' and a.stripe_subscription_id is not null) then
    raise exception 'Subscription already exists'; end if;
  update public.accounts set stripe_customer_id=p_customer_id where id=p_account_id;
  update public.billing_checkout_attempts set customer_id=p_customer_id,session_id=coalesce(session_id,p_session_id)
    where account_id=p_account_id;
  return true;
end;
$$;

revoke all on function public.prepare_billing_checkout(uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.record_billing_checkout(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_billing_checkout(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.record_billing_checkout(uuid,uuid,uuid,text,text) to service_role;

-- Covers accept_invitation's implicit deletion too: its transaction rolls back
-- the membership move if the old account has billing or an uncertain checkout.
create function public.guard_account_billing_removal() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.stripe_customer_id is not null or old.stripe_subscription_id is not null
     or coalesce(old.subscription_status,'inactive') not in ('inactive','trialing')
     or exists(select 1 from public.billing_checkout_attempts where account_id=old.id) then
    raise exception 'Account has billing history or pending checkout; removal requires review';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_account_billing_removal() from public,anon,authenticated;
create trigger guard_account_billing_removal before delete on public.accounts
  for each row execute function public.guard_account_billing_removal();
commit;
