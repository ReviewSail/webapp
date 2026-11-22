-- 0024_unify_guest_feedback.sql
--
-- `feedback` and `private_feedback` have already converged everywhere except
-- storage: ReviewSailContext defines ONE type for both, queries both, and
-- merges them into ONE array that the entire dashboard reads. The split buys
-- nothing and costs two round trips, two policy sets, and a shared type whose
-- optional fields are exactly "the columns the other table lacks".
--
-- It is also actively causing two bugs that a single table removes by
-- construction:
--
--   1. markPrivateFeedbackRead could never work. 0018 added an UPDATE *policy*
--      for authenticated on private_feedback, but authenticated was only ever
--      GRANTed SELECT (0013). A policy does not substitute for a table grant,
--      so the call failed 42501 and the unread badge never cleared — the exact
--      symptom 0018 set out to fix.
--   2. respondToFeedback always updated `feedback`, but the ids in the merged
--      array are overwhelmingly private_feedback ids. Manager replies matched
--      zero rows and silently no-opped; private_feedback.manager_response was
--      written by no code path in the repo.
--
-- Both source tables are empty (verified against production), so there is no
-- backfill, no dual-write window, and nothing to roll back. This is only cheap
-- while that is true.
--
-- Note: `feedback` was never in a migration — it was created imperatively by
-- the setup-db edge function, which is deleted in this change set. This file
-- brings the last stray table under version control on its way out.

-- --------------------------------------------------------------------------
-- The unified table
-- --------------------------------------------------------------------------
create table public.guest_feedback (
  id          uuid primary key default gen_random_uuid(),

  -- Real foreign keys. Neither predecessor had one, so both accumulated rows
  -- pointing at nothing; the legacy /feedback page inserted request_id = null
  -- outright.
  request_id  uuid references public.review_requests(id) on delete set null,

  -- NOT NULL, and derived server-side by submit_guest_feedback (0025) rather
  -- than posted by the browser. Previously nullable, absent from `feedback`
  -- entirely, and client-supplied on private_feedback — meaning anyone could
  -- file a complaint against any tenant's location.
  location_id uuid not null references public.locations(id) on delete cascade,

  -- What the two tables were encoding structurally, made explicit:
  --   rating    happy guest tapping through to Google (text optional)
  --   complaint 1-3 stars, caught by the gate before it reaches Google
  --   recovery  follow-up message from the thank-you screen, no rating
  kind        text not null check (kind in ('rating', 'complaint', 'recovery')),

  star_rating int check (star_rating between 1 and 5),

  -- Length caps throughout; feedback_text was previously unbounded and
  -- writable by anon.
  feedback_text    text check (char_length(feedback_text) <= 4000),
  guest_name       text check (char_length(guest_name)   <= 200),
  guest_email      text check (char_length(guest_email)  <= 320),
  manager_response text check (char_length(manager_response) <= 4000),

  is_read     boolean     not null default false,
  created_at  timestamptz not null default now(),

  -- A rating may carry text: the legacy /feedback page collects a comment at
  -- any star level, and a happy guest who writes something is worth keeping.
  -- What each kind may NOT do is contradict itself.
  constraint guest_feedback_shape check (
       (kind = 'rating'    and star_rating is not null)
    or (kind = 'complaint' and star_rating between 1 and 3 and feedback_text is not null)
    or (kind = 'recovery'  and star_rating is null         and feedback_text is not null)
  )
);

-- Neither predecessor had a single index.
create index guest_feedback_location_created_idx
  on public.guest_feedback (location_id, created_at desc);

-- Drives the sidebar unread badge.
create index guest_feedback_unread_idx
  on public.guest_feedback (location_id)
  where is_read = false and kind <> 'rating';

-- Drives the per-request throttle in submit_guest_feedback (0025).
create index guest_feedback_request_idx
  on public.guest_feedback (request_id);

-- --------------------------------------------------------------------------
-- RLS
--
-- authenticated gets SELECT *and UPDATE* — the missing UPDATE grant is bug 1
-- above. anon gets nothing at all: guest writes go through the SECURITY
-- DEFINER RPC added in 0025, not through a table grant.
-- --------------------------------------------------------------------------
alter table public.guest_feedback enable row level security;

grant select, update on table public.guest_feedback to authenticated;
grant select, insert, update, delete on table public.guest_feedback to service_role;

-- location_id being NOT NULL collapses what used to be a three-table join
-- (feedback -> review_requests -> orders -> locations) into one lookup.
create policy guest_feedback_select_account on public.guest_feedback
  for select to authenticated
  using (
    location_id in (
      select l.id from public.locations l
      where l.account_id = public.get_current_account_id()
    )
  );

-- WITH CHECK as well as USING. The old feedback_update_account_scoped (0000)
-- had only USING, which let a user move a row out of their own account.
create policy guest_feedback_update_account on public.guest_feedback
  for update to authenticated
  using (
    location_id in (
      select l.id from public.locations l
      where l.account_id = public.get_current_account_id()
    )
  )
  with check (
    location_id in (
      select l.id from public.locations l
      where l.account_id = public.get_current_account_id()
    )
  );

-- No DELETE policy for anyone, matching the deliberate choice in 0000.

-- --------------------------------------------------------------------------
-- Recognition scan trigger
--
-- The WHEN clause is a cost control, not a nicety. Every insert used to fire
-- net.http_post -> scan-feedback-recognition -> OpenAI, including happy
-- ratings that carry nothing to scan. Combined with the capability check in
-- 0025, an anonymous POST loop can no longer spend OpenAI credit.
-- --------------------------------------------------------------------------
create or replace function public.handle_new_guest_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, net, private
as $function$
begin
  perform net.http_post(
    url     := 'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/scan-feedback-recognition',
    body    := jsonb_build_object('feedback_id', new.id),
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', private.cron_auth_header()
    ),
    timeout_milliseconds := 30000
  );
  return new;
end;
$function$;

create trigger on_guest_feedback_insert
  after insert on public.guest_feedback
  for each row
  when (new.kind <> 'rating')
  execute function public.handle_new_guest_feedback();

-- --------------------------------------------------------------------------
-- Retire the predecessors. Both are empty; nothing is lost.
-- --------------------------------------------------------------------------
drop trigger if exists on_private_feedback_insert on public.private_feedback;
drop function if exists public.handle_new_private_feedback();

drop table if exists public.private_feedback;
drop table if exists public.feedback;
