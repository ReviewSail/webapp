-- 0020_guest_status_transitions.sql
--
-- Three problems, all blocking guest-facing status transitions.
--
-- 1. REGRESSION from 0018. Dropping `review_requests_anon_select` also broke the
--    anon UPDATE path: Postgres applies SELECT policies to the rows an UPDATE
--    must read, so with no SELECT policy the UPDATE matched zero rows.
--    PostgREST still answers 204, so this failed completely silently — the gate
--    never marked a request `clicked`.
--
--    Restoring a broad anon SELECT policy would undo the point of 0018 (it let
--    anyone enumerate every request_id, the only token guarding the gate). So
--    the transitions move into a SECURITY DEFINER RPC instead, matching the
--    approach already used for get_feedback_gate_context.
--
-- 2. The status CHECK constraint allowed only pending/sent/clicked/opted_out,
--    while the application writes `already_reviewed` (AlreadyReviewed page),
--    `expired` (process-reviews), and `private_feedback` (FeedbackGate). Every
--    one of those writes violated the constraint, so self-suppression never
--    worked and review requests could never expire.
--
-- 3. message_events rejected the `already_reviewed` event type for the same
--    reason.

-- --------------------------------------------------------------------------
-- (1) Align the constraints with what the application actually writes.
-- --------------------------------------------------------------------------

alter table public.review_requests drop constraint if exists review_requests_status_check;
alter table public.review_requests add constraint review_requests_status_check
  check (status = any (array[
    'pending', 'sent', 'clicked', 'opted_out',
    'expired', 'already_reviewed', 'private_feedback'
  ]));

alter table public.message_events drop constraint if exists message_events_event_type_check;
alter table public.message_events add constraint message_events_event_type_check
  check (event_type = any (array[
    'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed',
    'reminder_sent', 'midstay_checkin', 'already_reviewed'
  ]));

-- --------------------------------------------------------------------------
-- (2) One RPC for every guest-driven transition. Guests need no table grants,
--     so request_ids stay non-enumerable and the legal transitions live in one
--     auditable place.
-- --------------------------------------------------------------------------

create or replace function public.record_request_event(p_request_id uuid, p_event text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if p_event not in ('clicked', 'already_reviewed', 'private_feedback') then
    raise exception 'Unsupported request event: %', p_event;
  end if;

  -- Only ever moves forward from a live request; a second click is a harmless
  -- no-op rather than an error.
  update public.review_requests
     set status = p_event
   where id = p_request_id
     and status in ('pending', 'sent', 'clicked');

  get diagnostics updated_count = row_count;

  -- 'private_feedback' is a request status, not a message event.
  if updated_count > 0 and p_event in ('clicked', 'already_reviewed') then
    insert into public.message_events (request_id, event_type)
    values (p_request_id, p_event);
  end if;

  return updated_count > 0;
end;
$$;

revoke all on function public.record_request_event(uuid, text) from public;
grant execute on function public.record_request_event(uuid, text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- (3) With the RPC in place, guests no longer need direct table access.
-- --------------------------------------------------------------------------

drop policy if exists "review_requests_anon_update" on public.review_requests;
revoke update on table public.review_requests from anon;
revoke insert on table public.message_events from anon;
drop policy if exists "message_events_insert_public" on public.message_events;
