-- User & Role Provisioning Phase 3B: last_login_at + extended audit event types.
-- Run after user_provisioning_phase3a_roles_migration.sql and
-- user_provisioning_password_reset_event_migration.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Last login timestamp on profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_last_login_at_idx
  ON public.profiles (tenant_id, last_login_at DESC NULLS LAST);

COMMENT ON COLUMN public.profiles.last_login_at IS
  'Updated on authenticated sign-in via touch_platform_user_last_login().';

-- ---------------------------------------------------------------------------
-- Sign-in synchronization (called from portal after SIGNED_IN)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_platform_user_last_login()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET last_login_at = v_now
  WHERE user_id = v_user_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or inactive';
  END IF;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_platform_user_last_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_platform_user_last_login() TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend provisioning audit event types
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_provisioning_events DROP CONSTRAINT IF EXISTS user_provisioning_events_event_type_check;

ALTER TABLE public.user_provisioning_events ADD CONSTRAINT user_provisioning_events_event_type_check
  CHECK (
    event_type IN (
      'created',
      'updated',
      'deactivated',
      'reactivated',
      'lab_transferred',
      'password_reset',
      'role_changed',
      'ownership_reassigned'
    )
  );

COMMENT ON TABLE public.user_provisioning_events IS
  'Append-only HQ user provisioning audit (created, updated, deactivated, reactivated, lab_transferred, password_reset, role_changed, ownership_reassigned).';
