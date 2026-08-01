-- Records where a booking came from: direct, Airbnb, Booking.com, or other.
--
-- Lives on orders rather than customers because it describes the stay, not the
-- person — the same guest can arrive via Airbnb once and book direct the next
-- time, and attributing both to one channel would misreport every repeat guest.
--
-- Deliberately nullable and unconstrained: rows imported before this column
-- existed have no source to backfill, and a CHECK constraint would turn an
-- unrecognised value from a future OTA export into a failed import.

alter table public.orders
  add column if not exists source text;

comment on column public.orders.source is
  'Booking origin: direct | airbnb | booking_com | other. Null for stays recorded before this column existed.';

-- Reporting reads this per location ("how many Airbnb stays last month"), and
-- orders is already scoped by location_id, so that is the useful leading column.
create index if not exists orders_location_source_idx
  on public.orders (location_id, source)
  where source is not null;

-- No RLS change needed: orders has no account_id, and the existing policy in
-- 0018_fix_anon_guest_flow.sql scopes it transitively through
-- location_id -> locations -> accounts. A new column inherits that.
