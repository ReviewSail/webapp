-- The monthly digest had no way to ever be sent.
--
-- weekly-summary decides its period from the `frequency` field of the request
-- body, and then skips any recipient whose own preference disagrees. The only
-- scheduled caller — 'invoke-weekly-summary', from 0023 — posts '{}', so every
-- run was a weekly run, and every user who chose "Monthly" in Settings → Digest
-- was skipped on every run, forever. The option was inert from the day it
-- shipped.
--
-- Two fixes, one either side of the wire:
--
--   * the function no longer treats a body-supplied frequency as an override
--     that bypasses the recipient's preference — the preference is now always
--     authoritative, so a run only ever mails the people who asked for that
--     cadence;
--   * both cadences now say which one they are, below.
--
-- Deploy the function before applying this, or the monthly run will post
-- frequency=monthly to a version that reads it as a "force" flag and mails the
-- monthly digest to weekly subscribers too.

select cron.unschedule('invoke-weekly-summary');

-- Mondays 08:00 UTC, unchanged, but now explicit about being the weekly run.
select cron.schedule(
  'invoke-weekly-summary',
  '0 8 * * 1',
  $job$
  select net.http_post(
    url     := 'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/weekly-summary',
    body    := '{"frequency":"weekly"}'::jsonb,
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', private.cron_auth_header()
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- The 1st of each month at 08:00 UTC. A day-of-month schedule rather than a
-- "first Monday" approximation: the digest reports a calendar month, so it
-- should land at the start of one.
select cron.schedule(
  'invoke-monthly-summary',
  '0 8 1 * *',
  $job$
  select net.http_post(
    url     := 'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/weekly-summary',
    body    := '{"frequency":"monthly"}'::jsonb,
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', private.cron_auth_header()
    ),
    timeout_milliseconds := 60000
  );
  $job$
);
