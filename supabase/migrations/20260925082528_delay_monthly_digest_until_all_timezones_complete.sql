-- The first-of-month 08:00 UTC run is still in the previous month for western
-- properties (for example Hawaii). At 13:00 UTC even UTC-12 has completed its
-- prior calendar month. Keep the existing command, owner, database and active
-- state; only move the named monthly job. Never create/activate a missing job.
do $migration$
declare
  monthly_job record;
begin
  select jobid, schedule, command into monthly_job
  from cron.job
  where jobname = 'invoke-monthly-summary';

  if not found then
    raise exception 'Monthly digest cron job is missing; inspect deployment before scheduling';
  end if;
  if monthly_job.schedule not in ('0 8 1 * *', '0 13 1 * *')
     or position('/functions/v1/weekly-summary' in monthly_job.command) = 0
     or position('"frequency":"monthly"' in monthly_job.command) = 0
     or position('private.cron_auth_header()' in monthly_job.command) = 0 then
    raise exception 'Monthly digest cron job differs from reviewed baseline; inspect before altering';
  end if;

  perform cron.alter_job(monthly_job.jobid, schedule := '0 13 1 * *');
end
$migration$;
