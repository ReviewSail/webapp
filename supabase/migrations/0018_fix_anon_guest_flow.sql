-- 0018_fix_anon_guest_flow.sql
--
-- The public guest flow (feedback gate, feedback, already-reviewed) fails with
-- "42501: permission denied for table locations" for every anonymous visitor.
--
-- Root cause: the tenant-scoping policies below were created without a TO clause,
-- so they default to role `public`, which includes `anon`. Postgres evaluates every
-- applicable policy for the current role, and these policies subquery `locations` /
-- `orders` -- tables `anon` holds no grant on. The permission error aborts the whole
-- statement before RLS filtering ever happens.
--
-- Fix: scope the tenant policies to `authenticated`, and give the guest pages a
-- narrow SECURITY DEFINER RPC instead of a nested PostgREST join.

-- ---------------------------------------------------------------------------
-- (a) Scope tenant policies to authenticated so anon never evaluates them.
--     Definitions are reproduced verbatim from the existing policies; the only
--     change is the TO clause. service_role bypasses RLS and is unaffected.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can manage account customers" on public.customers;
create policy "Users can manage account customers"
  on public.customers for all to authenticated
  using (account_id = public.get_current_account_id());

drop policy if exists "Users can manage location orders" on public.orders;
create policy "Users can manage location orders"
  on public.orders for all to authenticated
  using (
    location_id in (
      select l.id from public.locations l
      where l.account_id = public.get_current_account_id()
    )
  );

drop policy if exists "Users can manage location review requests" on public.review_requests;
create policy "Users can manage location review requests"
  on public.review_requests for all to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      join public.locations l on o.location_id = l.id
      where l.account_id = public.get_current_account_id()
    )
  );

drop policy if exists "Users can view message events" on public.message_events;
create policy "Users can view message events"
  on public.message_events for select to authenticated
  using (
    request_id in (
      select rr.id
      from public.review_requests rr
      join public.orders o on rr.order_id = o.id
      join public.locations l on o.location_id = l.id
      where l.account_id = public.get_current_account_id()
    )
  );

drop policy if exists "Users can manage location templates" on public.message_templates;
create policy "Users can manage location templates"
  on public.message_templates for all to authenticated
  using (
    location_id in (
      select l.id from public.locations l
      where l.account_id = public.get_current_account_id()
    )
  );

-- ---------------------------------------------------------------------------
-- (b) Guest pages read their context through a narrow RPC instead of a join.
--     This avoids granting anon any read on locations/orders, and removes the
--     ability to enumerate request_ids (the only token guarding the gate).
-- ---------------------------------------------------------------------------

create or replace function public.get_feedback_gate_context(p_request_id uuid)
returns table (
  location_id uuid,
  location_name text,
  google_place_url text,
  recovery_email text
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.name, l.google_place_url, l.recovery_email
  from public.review_requests rr
  join public.orders o on o.id = rr.order_id
  join public.locations l on l.id = o.location_id
  where rr.id = p_request_id
    and rr.status in ('sent', 'clicked', 'pending');
$$;

revoke all on function public.get_feedback_gate_context(uuid) from public;
grant execute on function public.get_feedback_gate_context(uuid) to anon, authenticated;

-- The broad anon SELECT policy let anyone list every request id across all
-- tenants. The RPC replaces its only legitimate use.
drop policy if exists "review_requests_anon_select" on public.review_requests;

-- review_requests_anon_update is deliberately kept: it permits only the
-- sent -> clicked | already_reviewed transition the guest pages need.

-- ---------------------------------------------------------------------------
-- (c) Revoke the stray anon grants that migration 0015 missed. Today RLS is the
--     only thing preventing abuse on these tables; one missing policy would be
--     a full breach.
-- ---------------------------------------------------------------------------

revoke all on table public.private_feedback    from anon;
revoke all on table public.team_members        from anon;
revoke all on table public.recognition_records from anon;
revoke all on table public.digest_settings     from anon;

-- The feedback gate needs exactly one anon capability on private_feedback.
grant insert on table public.private_feedback to anon;

-- private_feedback had no UPDATE policy at all, so markPrivateFeedbackRead()
-- silently updated zero rows and the unread badge never cleared.
drop policy if exists "private_feedback_update_admin" on public.private_feedback;
create policy "private_feedback_update_admin"
  on public.private_feedback for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'
        and u.account_id = (
          select l.account_id from public.locations l
          where l.id = private_feedback.location_id
        )
    )
  );
