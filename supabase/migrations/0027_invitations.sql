-- Real team invitations.
--
-- Before this, invite-team-member wrote nothing to the database: it emailed a
-- link to /login?invite_account_id=<account uuid>, and the client inserted a
-- users row straight from that URL parameter. Anyone holding an account UUID
-- could join as staff, and pending invites could be neither listed nor revoked.
--
-- Now an invitation is a row with a random token. The token is the credential:
-- the invitee never gets read access to this table, and redemption goes through
-- the SECURITY DEFINER function accept_invitation() below.

CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  token       text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One live invite per address per account. Resending revokes the old row first,
-- which is what makes "Resend" issue a fresh token and a fresh expiry.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_one_pending_per_email
  ON public.invitations (account_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invitations_account_id_idx ON public.invitations (account_id);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invitations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

DROP POLICY IF EXISTS "invitations_manage_admin" ON public.invitations;
CREATE POLICY "invitations_manage_admin" ON public.invitations
  FOR ALL
  TO authenticated
  USING (
    account_id = public.get_current_account_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    account_id = public.get_current_account_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );


-- ---------------------------------------------------------------------------
-- An account must always keep at least one admin.
--
-- The Team tab checks this client-side too, but two admins demoting each other
-- at the same time would otherwise strand an account with nobody who can reach
-- Settings, billing, or the team.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_admins  integer;
  v_remaining_members integer;
BEGIN
  -- Only demotions and deletions can remove an admin.
  IF TG_OP = 'UPDATE' AND (OLD.role IS NOT DISTINCT FROM NEW.role) THEN
    RETURN NEW;
  END IF;

  IF OLD.role <> 'admin' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT count(*) FILTER (WHERE role = 'admin'), count(*)
    INTO v_remaining_admins, v_remaining_members
  FROM public.users
  WHERE account_id = OLD.account_id
    AND id <> OLD.id;

  -- Only a team can be stranded. A sole member leaving their own account has
  -- nobody to lock out — which is exactly what accept_invitation() does when it
  -- moves an invitee off the throwaway account signup gave them.
  IF v_remaining_members > 0 AND v_remaining_admins = 0 THEN
    RAISE EXCEPTION 'last_admin'
      USING HINT = 'Promote another member to admin before changing or removing this one.';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS users_prevent_last_admin_removal ON public.users;
CREATE TRIGGER users_prevent_last_admin_removal
  BEFORE UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_admin_removal();


-- ---------------------------------------------------------------------------
-- Redeem an invitation.
--
-- SECURITY DEFINER because the invitee cannot read public.invitations and must
-- not be able to. The token plus a matching signed-in email address is the
-- whole authorisation check.
--
-- Signup context: handle_new_auth_user() gives every new auth user their own
-- account, a users row with role 'admin', a default location and a default
-- template. So an invitee always arrives here already owning an empty account,
-- and redemption re-points them at the inviting account and discards that
-- throwaway one. The data guard below is what stops that from ever discarding
-- an account somebody is really using.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation   public.invitations%ROWTYPE;
  v_user_id      uuid := auth.uid();
  v_user_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_old_account  uuid;
  v_member_count integer;
  v_data_count   integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_invitation
  FROM public.invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;

  -- A leaked link is useless to anyone but the addressee.
  IF lower(v_invitation.email) <> v_user_email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  SELECT account_id INTO v_old_account FROM public.users WHERE id = v_user_id;

  IF v_old_account IS NULL THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;

  -- Already a member of the inviting account; just settle the invitation.
  IF v_old_account = v_invitation.account_id THEN
    UPDATE public.invitations
      SET status = 'accepted', accepted_at = now()
      WHERE id = v_invitation.id;
    RETURN jsonb_build_object('account_id', v_invitation.account_id, 'role', v_invitation.role);
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.users WHERE account_id = v_old_account;

  -- Locations are not a signal: the signup trigger always creates one. Guests
  -- are. orders is scoped through locations, not account_id.
  SELECT (SELECT count(*) FROM public.customers WHERE account_id = v_old_account)
       + (SELECT count(*) FROM public.orders o
            JOIN public.locations l ON l.id = o.location_id
           WHERE l.account_id = v_old_account)
    INTO v_data_count;

  -- Their existing account holds real guests, or other people. Re-pointing them
  -- would orphan all of it, so refuse and let the UI explain.
  IF v_member_count > 1 OR v_data_count > 0 THEN
    RAISE EXCEPTION 'invite_account_has_data';
  END IF;

  UPDATE public.users
    SET account_id = v_invitation.account_id,
        role       = v_invitation.role
    WHERE id = v_user_id;

  -- Safe by the guard above: nothing but the signup trigger's default location
  -- and template, which cascade.
  DELETE FROM public.accounts WHERE id = v_old_account;

  UPDATE public.invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_invitation.id;

  RETURN jsonb_build_object('account_id', v_invitation.account_id, 'role', v_invitation.role);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
