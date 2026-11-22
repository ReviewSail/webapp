-- Staff need templates for ordinary property reads, but only account admins
-- may change guest-message copy. The old permissive FOR ALL policy overrides
-- an admin-only policy because permissive RLS policies are OR-combined.

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'message_templates'
      and policyname not in (
        'Users can manage location templates',
        'Admins can manage location templates'
      )
  ) then
    raise exception 'Unexpected message_templates policy; review before replacing access rules';
  end if;
end;
$$;

alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon, authenticated;
grant select, insert, update, delete on public.message_templates to authenticated;

drop policy if exists "Users can manage location templates" on public.message_templates;
drop policy if exists "Admins can manage location templates" on public.message_templates;

create policy "Account members can read location templates"
on public.message_templates for select to authenticated
using (
  location_id in (
    select l.id from public.locations l
    where l.account_id = (select public.get_current_account_id())
  )
);

create policy "Account admins can insert location templates"
on public.message_templates for insert to authenticated
with check (
  (select public.is_current_user_admin())
  and location_id in (
    select l.id from public.locations l
    where l.account_id = (select public.get_current_account_id())
  )
);

create policy "Account admins can update location templates"
on public.message_templates for update to authenticated
using (
  (select public.is_current_user_admin())
  and location_id in (
    select l.id from public.locations l
    where l.account_id = (select public.get_current_account_id())
  )
)
with check (
  (select public.is_current_user_admin())
  and location_id in (
    select l.id from public.locations l
    where l.account_id = (select public.get_current_account_id())
  )
);

create policy "Account admins can delete location templates"
on public.message_templates for delete to authenticated
using (
  (select public.is_current_user_admin())
  and location_id in (
    select l.id from public.locations l
    where l.account_id = (select public.get_current_account_id())
  )
);

notify pgrst, 'reload schema';
