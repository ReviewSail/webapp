-- Step 1 / F01: global suppression contacts must never reach a browser.
-- Apply this migration and deploy the matching frontend in one maintenance
-- window. Old frontends can no longer read opt_outs and their CSV import will
-- fail closed until refreshed. Do not restore the old permissive grant.
begin;

alter table public.opt_outs enable row level security;
drop policy if exists "Authenticated users can view opt-outs" on public.opt_outs;
drop policy if exists "Anyone can insert opt-outs" on public.opt_outs;
drop policy if exists opt_outs_anon_insert_policy on public.opt_outs;
revoke all on table public.opt_outs from public, anon, authenticated;
-- Existing server workers still need this table; never grant it to the client.
grant select on table public.opt_outs to service_role;

create schema if not exists private;

-- A trigger rather than a public lookup RPC: no API accepting arbitrary email
-- addresses, and no global list returned. It only sets the request's status.
create or replace function private.apply_request_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text;
  v_phone text;
  v_user_id uuid := auth.uid();
begin
  if new.status <> 'pending' then
    return new;
  end if;

  -- Definer access must not let a caller inspect a foreign customer's state.
  -- Service-role jobs have no auth.uid(); authenticated writers must own the
  -- stay, and its customer must belong to the same account as the location.
  select nullif(pg_catalog.btrim(c.email), ''),
         nullif(pg_catalog.regexp_replace(c.phone, '[^0-9]', '', 'g'), '')
    into v_email, v_phone
  from public.orders o
  join public.locations l on l.id = o.location_id
  join public.customers c on c.id = o.customer_id and c.account_id = l.account_id
  where o.id = new.order_id
    and (v_user_id is null or exists (
      select 1 from public.users u
      where u.id = v_user_id and u.account_id = l.account_id
    ));

  if not found then
    raise exception 'Request stay is not accessible.' using errcode = '42501';
  end if;

  -- Preserve the sender's existing policy: an email opt-out suppresses the
  -- request; a phone opt-out does not suppress a separately available email.
  -- Phone-only guests can be classified immediately without exposing numbers.
  if (v_email is not null and exists (
    select 1 from public.opt_outs oo
    where pg_catalog.lower(oo.email) = pg_catalog.lower(v_email)
  )) or (v_email is null and v_phone is not null and exists (
    select 1 from public.opt_outs oo
    where pg_catalog.regexp_replace(oo.phone, '[^0-9]', '', 'g') = v_phone
  )) then
    new.status := 'opted_out';
  end if;
  return new;
end;
$function$;

revoke all on function private.apply_request_suppression() from public, anon, authenticated;

drop trigger if exists apply_request_suppression on public.review_requests;
create trigger apply_request_suppression
before insert or update of order_id, status on public.review_requests
for each row execute function private.apply_request_suppression();

comment on function private.apply_request_suppression() is
  'Privately classify queued requests against suppression. No raw contacts or public lookup RPC.';

-- submit_opt_out(uuid) remains the capability-protected guest write path.
-- Its owner retains access; existing opt-outs and requests are not deleted.
commit;
