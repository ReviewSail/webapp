-- Staff users could see nothing at all.
--
-- public.locations carried exactly one policy:
--
--   "Users can manage their account locations"
--     FOR ALL USING (account_id = get_current_account_id() AND is_current_user_admin())
--
-- 0028 rewrote how that policy asks "is the caller an admin?" but kept the
-- admin test itself, and — unlike public.users, which has the companion
-- "Users can view account members" — locations had no staff-readable policy to
-- fall back on. So for a staff member the table returned zero rows.
--
-- That did not stop at locations. orders, review_requests, guest_feedback,
-- message_events and message_templates are all scoped by a subquery of the
-- form `location_id IN (SELECT id FROM locations WHERE account_id = ...)`, and
-- a policy's subquery is itself subject to the referenced table's RLS. With
-- locations empty, every one of those subqueries was empty too. Measured
-- against production data, a staff user saw:
--
--   locations 0 | orders 0 | review_requests 0 | guest_feedback 0
--   message_templates 0 | customers 3
--
-- i.e. the header stuck on "Select location", the onboarding wizard reappeared
-- on a fully set-up account, and the dashboard, inbox and analytics were empty
-- states. The whole Team feature was inert, while the invite form promised
-- "Staff can see guests, feedback, and analytics."
--
-- The fix is a read policy, not a change to the existing one. Policies are
-- OR'd for SELECT, so this widens reads to every member of the account; and
-- because a FOR SELECT policy never authorises INSERT/UPDATE/DELETE, writes
-- still go through the admin-gated FOR ALL policy untouched. Adding a location,
-- renaming one, editing its send hour or deleting it all remain admin-only.

DROP POLICY IF EXISTS "Members can view their account locations" ON public.locations;
CREATE POLICY "Members can view their account locations" ON public.locations
  FOR SELECT
  TO authenticated
  USING (account_id = public.get_current_account_id());

COMMENT ON POLICY "Members can view their account locations" ON public.locations IS
  'Read access for every member of the account, staff included. Writes stay admin-only via "Users can manage their account locations" — see migration 0029.';
