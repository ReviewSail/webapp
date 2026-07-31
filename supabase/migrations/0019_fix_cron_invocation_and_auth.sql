-- 0019_fix_cron_invocation_and_auth.sql
--
-- Two problems with the scheduled/triggered edge function invocations:
--
-- 1. Both cron jobs called `public.http_post(text, text, text, text)`, which does
--    not exist. Every run since the jobs were created failed with
--    "function public.http_post(unknown, unknown, unknown, unknown) does not exist",
--    so process-reviews has never fired on schedule. The real function is
--    net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout int).
--
-- 2. process-reviews, weekly-summary and scan-feedback-recognition are deployed
--    with verify_jwt=false and had no auth check, leaving them open to the
--    internet. They now require `Authorization: Bearer <CRON_SECRET>`, so every
--    caller below must send it.
--
-- NOTE: CRON_SECRET is embedded in the job/trigger definitions. cron.job and this
-- function body are only readable by privileged database roles, not by anon or
-- authenticated. Rotating the secret means updating the Supabase secret AND
-- re-running this migration.

-- --------------------------------------------------------------------------
-- Scheduled jobs
-- --------------------------------------------------------------------------

select cron.unschedule('invoke-process-reviews');
select cron.unschedule('invoke-weekly-summary');

select cron.schedule(
  'invoke-process-reviews',
  '0 * * * *',
  $job$
  select net.http_post(
    url     := 'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/process-reviews',
    body    := '{}'::jsonb,
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer d830f3bbf22e82541b31ae11031bcd02ccdeb5de5670b9bd428da25d31137fd5'
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'invoke-weekly-summary',
  '0 8 * * 1',
  $job$
  select net.http_post(
    url     := 'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/weekly-summary',
    body    := '{}'::jsonb,
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer d830f3bbf22e82541b31ae11031bcd02ccdeb5de5670b9bd428da25d31137fd5'
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- --------------------------------------------------------------------------
-- private_feedback -> scan-feedback-recognition trigger
--
-- Previously posted with no Authorization header at all, which would start
-- 401ing the moment the guard above landed. Also had a mutable search_path
-- (flagged by the Supabase security advisor).
-- --------------------------------------------------------------------------

create or replace function public.handle_new_private_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $function$
begin
  perform net.http_post(
    url     := 'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/scan-feedback-recognition',
    body    := jsonb_build_object('feedback_id', new.id),
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer d830f3bbf22e82541b31ae11031bcd02ccdeb5de5670b9bd428da25d31137fd5'
    ),
    timeout_milliseconds := 30000
  );
  return new;
end;
$function$;

-- Same advisor finding on the signup trigger; body is unchanged.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_account_id uuid;
  new_location_id uuid;
begin
  insert into public.accounts (name)
  values (coalesce(new.raw_user_meta_data->>'full_name', 'My Account'))
  returning id into new_account_id;

  insert into public.users (id, account_id, role, email, full_name)
  values (
    new.id,
    new_account_id,
    'admin',
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Member')
  );

  insert into public.locations (account_id, name, timezone)
  values (new_account_id, 'Main Location', 'UTC')
  returning id into new_location_id;

  insert into public.message_templates (location_id, type, template_text)
  values (new_location_id, 'email', 'Hi {firstName}, thanks for your visit! Please leave us a review: {reviewLink}');

  return new;
end;
$function$;
