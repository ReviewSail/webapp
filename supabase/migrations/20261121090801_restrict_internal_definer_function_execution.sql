-- Restrict SECURITY DEFINER helpers to the roles that need them.
-- Guest-facing RPCs (get_feedback_gate_context, get_property_gate_context,
-- record_request_event, submit_opt_out) intentionally retain anon access.

begin;

-- RLS policies call these as the signed-in user. They are not public RPCs.
revoke execute on function public.get_current_account_id() from public, anon;
grant execute on function public.get_current_account_id() to authenticated;

revoke execute on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

-- Trigger functions run through their installed triggers; clients must not
-- invoke them as ordinary RPCs. Revoking EXECUTE does not remove the trigger.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_guest_feedback() from public, anon, authenticated, service_role;

-- accept_invitation remains authenticated-only (migration 0027).
commit;
