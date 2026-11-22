begin;

-- No raw Stripe payloads, payment details or email addresses are retained.
create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  account_id uuid references public.accounts(id) on delete set null,
  customer_id text not null,
  subscription_id text not null,
  outcome text not null check (outcome in ('applied','ignored_unrelated')),
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public,anon,authenticated;
grant select,insert on public.stripe_webhook_events to service_role;

alter table public.accounts add column billing_revision bigint not null default 0;

-- Every account writer participates in optimistic concurrency, including the
-- checkout customer assignment. Never hold a row lock across a Stripe request.
create function public.advance_billing_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.billing_revision := old.billing_revision + 1;
  return new;
end;
$$;
revoke all on function public.advance_billing_revision() from public,anon,authenticated;
create trigger advance_billing_revision before update on public.accounts
  for each row execute function public.advance_billing_revision();

create function public.apply_stripe_subscription_event(
  p_event_id text, p_event_type text, p_account_id uuid, p_customer_id text,
  p_subscription_id text, p_expected_revision bigint, p_status text,
  p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_allow_replacement boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_account record;
  v_outcome text := 'applied';
begin
  if nullif(p_event_id,'') is null or nullif(p_customer_id,'') is null
     or nullif(p_subscription_id,'') is null or p_event_type is null
     or p_event_type not in ('checkout.session.completed','customer.subscription.created',
       'customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed') then
    raise exception 'Invalid billing event' using errcode='22023';
  end if;
  select a.id,a.stripe_customer_id,a.stripe_subscription_id,a.billing_revision
    into v_account from public.accounts a where a.id=p_account_id for update;
  if not found then raise exception 'Billing account unavailable' using errcode='P0001'; end if;
  if exists (select 1 from public.stripe_webhook_events e where e.event_id=p_event_id) then
    return jsonb_build_object('outcome','duplicate');
  end if;
  if v_account.billing_revision is distinct from p_expected_revision then
    return jsonb_build_object('outcome','conflict');
  end if;
  if v_account.stripe_customer_id is not null and v_account.stripe_customer_id <> p_customer_id then
    raise exception 'Billing customer mismatch' using errcode='P0001';
  end if;
  if v_account.stripe_subscription_id is not null and v_account.stripe_subscription_id <> p_subscription_id
     and not (p_event_type='checkout.session.completed' and p_allow_replacement is true) then
    v_outcome := 'ignored_unrelated';
  else
    if p_status is null or p_status not in ('active','trialing','past_due','canceled','inactive')
       or p_cancel_at_period_end is null then
      raise exception 'Invalid subscription state' using errcode='22023';
    end if;
    update public.accounts set stripe_customer_id=p_customer_id,stripe_subscription_id=p_subscription_id,
      subscription_status=p_status,plan_name='Premium Pro',current_period_end=p_period_end,
      cancel_at_period_end=p_cancel_at_period_end where id=p_account_id;
  end if;
  -- A failed insert rolls back the account update too. Replay acknowledgement
  -- is only possible after both the state and this receipt have committed.
  insert into public.stripe_webhook_events(event_id,event_type,account_id,customer_id,subscription_id,outcome)
    values(p_event_id,p_event_type,p_account_id,p_customer_id,p_subscription_id,v_outcome);
  return jsonb_build_object('outcome',v_outcome);
end;
$$;
revoke all on function public.apply_stripe_subscription_event(text,text,uuid,text,text,bigint,text,timestamptz,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_event(text,text,uuid,text,text,bigint,text,timestamptz,boolean,boolean)
  to service_role;
commit;
