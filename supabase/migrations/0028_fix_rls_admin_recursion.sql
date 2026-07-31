-- Fix infinite recursion in the users RLS policy.
--
-- Every authenticated read of public.users failed in production with
--   42P17: infinite recursion detected in policy for relation "users"
--
-- Six policies asked "is the caller an admin?" by inlining
--
--   EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
--
-- On five of them that subquery reads another table's policy dependency; on
-- public.users itself it reads the very table the policy guards, so evaluating
-- the policy required evaluating the policy. Postgres detects the cycle and
-- raises, which meant the read failed for *every* caller, admin or not — and
-- because the other five policies also read public.users, they inherited the
-- failure.
--
-- The visible damage in the app:
--   * AuthContext.fetchUserRole caught the error and fell back to 'staff', so
--     admins lost the Settings nav item and every admin-only screen.
--   * locations never loaded, so the header showed "Select location", the
--     onboarding wizard reappeared, and the dashboard rendered empty states.
--   * accounts never loaded, so billing state read as inactive and the upgrade
--     banner showed on paid accounts.
--
-- get_current_account_id() already solved exactly this problem the right way:
-- a SECURITY DEFINER function runs as its owner and therefore does not
-- re-enter RLS. This adds the admin equivalent and points all six policies at
-- it. No policy's meaning changes — only how the same question is asked.

-- STABLE so it is evaluated once per statement rather than once per row.
-- SECURITY DEFINER so reading public.users here does not re-enter the policy
-- that called us. search_path is pinned, as Supabase requires for definers.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_current_user_admin() IS
  'True when the calling user is an admin. SECURITY DEFINER so RLS policies can ask without re-entering RLS on public.users — see migration 0028.';

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- --------------------------------------------------------------------------
-- users — the recursion itself.
--
-- The companion SELECT policy "Users can view account members" is left alone:
-- it carries no EXISTS, and policies are OR'd, so staff keep their read of the
-- member list exactly as before.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage account members" ON public.users;
CREATE POLICY "Admins can manage account members" ON public.users
  FOR ALL TO authenticated
  USING      (account_id = public.get_current_account_id() AND public.is_current_user_admin())
  WITH CHECK (account_id = public.get_current_account_id() AND public.is_current_user_admin());

-- --------------------------------------------------------------------------
-- The five policies that inherited the failure by reading public.users.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own account" ON public.accounts;
CREATE POLICY "Users can view their own account" ON public.accounts
  FOR SELECT TO authenticated
  USING (id = public.get_current_account_id() AND public.is_current_user_admin());

DROP POLICY IF EXISTS "Users can manage their account locations" ON public.locations;
CREATE POLICY "Users can manage their account locations" ON public.locations
  FOR ALL TO authenticated
  USING      (account_id = public.get_current_account_id() AND public.is_current_user_admin())
  WITH CHECK (account_id = public.get_current_account_id() AND public.is_current_user_admin());

DROP POLICY IF EXISTS "invitations_manage_admin" ON public.invitations;
CREATE POLICY "invitations_manage_admin" ON public.invitations
  FOR ALL TO authenticated
  USING      (account_id = public.get_current_account_id() AND public.is_current_user_admin())
  WITH CHECK (account_id = public.get_current_account_id() AND public.is_current_user_admin());

DROP POLICY IF EXISTS "team_members_manage_admin" ON public.team_members;
CREATE POLICY "team_members_manage_admin" ON public.team_members
  FOR ALL TO authenticated
  USING      (account_id = public.get_current_account_id() AND public.is_current_user_admin())
  WITH CHECK (account_id = public.get_current_account_id() AND public.is_current_user_admin());

DROP POLICY IF EXISTS "recognition_records_select_admin" ON public.recognition_records;
CREATE POLICY "recognition_records_select_admin" ON public.recognition_records
  FOR SELECT TO authenticated
  USING (account_id = public.get_current_account_id() AND public.is_current_user_admin());
