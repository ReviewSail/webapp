-- 0023_vault_cron_secret.sql
--
-- 0019 fixed the cron invocation but embedded CRON_SECRET as a plaintext
-- literal in three places: both cron.schedule bodies and the body of
-- handle_new_private_feedback(). Its header defended this on the grounds that
-- cron.job is readable only by privileged database roles — true, and beside the
-- point, because the value is also sitting in git. That secret is the only
-- thing standing between the internet and process-reviews, which spends real
-- money on Resend and Twilio.
--
-- The secret now lives in Vault (installed, and until now entirely unused) and
-- is read through one helper, so rotating it is a Vault update rather than an
-- edit-and-replay of this file.
--
-- OPERATOR: this migration will not apply until the secret exists. Create it
-- once, with a NEWLY GENERATED value — the old one is burned, it has been in
-- git history since 0019:
--
--   select vault.create_secret(
--     '<new 64-hex value>',
--     'cron_secret',
--     'Bearer token for scheduled and triggered edge function invocations'
--   );
--
-- and set the same value as the CRON_SECRET function secret, so the edge
-- functions' own `Bearer $CRON_SECRET` check agrees with what the caller sends.

-- --------------------------------------------------------------------------
-- Fail fast rather than silently scheduling jobs that 401 every hour.
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret') then
    raise exception
      'Vault secret "cron_secret" not found. Create it before applying this migration — see the header of 0023_vault_cron_secret.sql.';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- The helper. `private` is not in PostgREST's exposed schema list, so this is
-- unreachable over the API no matter what the grants say — belt and braces
-- alongside the explicit revoke below.
-- --------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.cron_auth_header()
returns text
language sql
security definer
set search_path = vault, pg_temp
stable
as $function$
  select 'Bearer ' || decrypted_secret
  from vault.decrypted_secrets
  where name = 'cron_secret';
$function$;

revoke all on function private.cron_auth_header() from public, anon, authenticated;

comment on function private.cron_auth_header() is
  'Authorization header for scheduled/triggered edge function calls. Reads the '
  '"cron_secret" Vault entry so the value appears in no migration and no job body.';

-- --------------------------------------------------------------------------
-- Re-schedule both jobs. Unchanged from 0019 apart from the header value:
-- process-reviews hourly, weekly-summary Mondays 08:00 UTC.
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
      'Authorization', private.cron_auth_header()
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
      'Authorization', private.cron_auth_header()
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- --------------------------------------------------------------------------
-- Same treatment for the private_feedback trigger. 0024 replaces this function
-- outright when the table it fires on is unified; it is corrected here so the
-- secret is out of every function body even if 0024 is not applied.
-- --------------------------------------------------------------------------
create or replace function public.handle_new_private_feedback()
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
