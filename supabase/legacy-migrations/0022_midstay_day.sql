-- 0022_midstay_day.sql
--
-- The mid-stay check-in fired 23-25 hours after `orders.checkin_date`. That
-- offset reads sensibly and means almost nothing, because checkin_date is a
-- date, not a moment: both writers (the CSV importer's toIsoDate and the manual
-- <input type="date">) store `yyyy-MM-dd`, which Postgres reads as midnight
-- UTC. "24 hours after check-in" therefore resolved to 01:00 UTC the following
-- day -- 6pm in Los Angeles, 9am in Berlin, 3am in Auckland. Phase 1 already
-- respects preferred_send_hour in the location's timezone; Phase 3 had no
-- local-time gating at all, so properties in the wrong zone were texting guests
-- overnight.
--
-- The fix is to stop pretending we know the arrival hour. Hosts pick a DAY of
-- the stay (day 1 = arrival day, day 2 = the morning after, the industry
-- default), and the message goes out on that day at the location's existing
-- preferred_send_hour. No new hour to configure, and no arithmetic on a
-- timestamp we never actually had.

alter table public.locations
  add column if not exists midstay_day integer not null default 2;

-- Day 1 is the arrival day: the guest is still checking in, so a "how's it
-- going" ping is premature. Beyond a week the stay is long enough that the
-- check-in has stopped being mid-stay.
alter table public.locations
  drop constraint if exists locations_midstay_day_check;
alter table public.locations
  add constraint locations_midstay_day_check
  check (midstay_day between 2 and 7);

-- Phase 3 selected every completed order ever, unbounded and unindexed, and
-- rows that fall out of the window keep midstay_sent = false forever, so the
-- scan only grew. The function now bounds on checkin_date; this is the index
-- that makes the bound worth having.
create index if not exists orders_midstay_pending_idx
  on public.orders (checkin_date)
  where midstay_sent = false and status = 'completed' and checkin_date is not null;
