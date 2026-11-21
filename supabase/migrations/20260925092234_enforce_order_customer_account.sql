-- A booking's guest must belong to the same account as its property.
-- Keep the existing FK names so PostgREST embeds remain unambiguous and
-- explicit !orders_customer_id_fkey / !orders_location_id_fkey joins still work.

do $$
begin
  if exists (
    select 1 from public.orders o
    left join public.locations l on l.id = o.location_id
    left join public.customers c on c.id = o.customer_id
    where l.id is null or c.id is null or l.account_id is distinct from c.account_id
  ) then
    raise exception 'Cannot enforce booking account integrity: existing orders have missing or cross-account links';
  end if;
end;
$$;

alter table public.orders add column account_id uuid;

update public.orders o
set account_id = l.account_id
from public.locations l
where l.id = o.location_id;

alter table public.orders alter column account_id set not null;

-- The primary keys make these pairs unique in practice, but a composite FK
-- needs a declared unique key on precisely the referenced columns.
create unique index locations_id_account_id_key on public.locations (id, account_id);
create unique index customers_id_account_id_key on public.customers (id, account_id);

create function private.set_order_account_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  select l.account_id into v_account_id
  from public.locations l
  where l.id = new.location_id;

  if v_account_id is null then
    raise exception 'Booking property is unavailable'
      using errcode = '23503';
  end if;

  -- Never trust a client-supplied tenant ID, including on UPDATE.
  new.account_id := v_account_id;
  return new;
end;
$$;

revoke all on function private.set_order_account_id() from public, anon, authenticated;

create trigger set_order_account_id_before_write
before insert or update on public.orders
for each row execute function private.set_order_account_id();

-- Replace, rather than duplicate, the old FKs: two relationships to the same
-- table make PostgREST's existing nested selects ambiguous.
alter table public.orders
  drop constraint orders_location_id_fkey,
  drop constraint orders_customer_id_fkey,
  add constraint orders_location_id_fkey
    foreign key (location_id, account_id)
    references public.locations (id, account_id) on delete cascade,
  add constraint orders_customer_id_fkey
    foreign key (customer_id, account_id)
    references public.customers (id, account_id) on delete cascade;

notify pgrst, 'reload schema';
