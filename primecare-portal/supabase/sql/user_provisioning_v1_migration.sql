-- User & Role Provisioning V1: audit events, lab transfer history, distributor_admin role.
-- Run after operations_center_agent_distributor_assignments_migration.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Extend profiles: distributor scope + territory + distributor_admin role
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS distributor_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS territory text;

CREATE INDEX IF NOT EXISTS profiles_distributor_id_idx ON public.profiles (distributor_id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (lower(role) IN ('admin', 'executive', 'agent', 'lab', 'distributor_admin'));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'ADMIN'::text,
    'EXECUTIVE'::text,
    'AGENT'::text,
    'LAB'::text,
    'DISTRIBUTOR_ADMIN'::text
  ]));

-- ---------------------------------------------------------------------------
-- Append-only provisioning audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_provisioning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_tenant_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('created', 'updated', 'deactivated', 'reactivated', 'lab_transferred')
  ),
  actor_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_provisioning_events_tenant_idx
  ON public.user_provisioning_events (hq_tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_provisioning_events_subject_idx
  ON public.user_provisioning_events (subject_user_id, created_at DESC);

COMMENT ON TABLE public.user_provisioning_events IS
  'Append-only HQ user provisioning audit (created, updated, deactivated, reactivated, lab_transferred).';

-- ---------------------------------------------------------------------------
-- Lab assignment transfer history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_tenant_id uuid NOT NULL,
  lab_tenant_id uuid NOT NULL,
  lab_id text NOT NULL,
  from_agent_id text,
  from_agent_name text,
  to_agent_id text,
  to_agent_name text,
  transferred_by uuid,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE INDEX IF NOT EXISTS lab_assignment_history_lab_idx
  ON public.lab_assignment_history (lab_tenant_id, lab_id, transferred_at DESC);

CREATE INDEX IF NOT EXISTS lab_assignment_history_hq_tenant_idx
  ON public.lab_assignment_history (hq_tenant_id, transferred_at DESC);

COMMENT ON TABLE public.lab_assignment_history IS
  'Append-only lab agent ownership transfer history for HQ provisioning.';

-- ---------------------------------------------------------------------------
-- RLS: admin/executive read; writes via trusted helpers or can_write_ops
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_provisioning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_provisioning_events_select_admin" ON public.user_provisioning_events;
CREATE POLICY "user_provisioning_events_select_admin"
  ON public.user_provisioning_events FOR SELECT TO authenticated
  USING (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(hq_tenant_id)
  );

DROP POLICY IF EXISTS "user_provisioning_events_insert_admin" ON public.user_provisioning_events;
CREATE POLICY "user_provisioning_events_insert_admin"
  ON public.user_provisioning_events FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(hq_tenant_id));

DROP POLICY IF EXISTS "lab_assignment_history_select_admin" ON public.lab_assignment_history;
CREATE POLICY "lab_assignment_history_select_admin"
  ON public.lab_assignment_history FOR SELECT TO authenticated
  USING (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(hq_tenant_id)
  );

DROP POLICY IF EXISTS "lab_assignment_history_insert_admin" ON public.lab_assignment_history;
CREATE POLICY "lab_assignment_history_insert_admin"
  ON public.lab_assignment_history FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(hq_tenant_id));

-- ---------------------------------------------------------------------------
-- Trusted deactivate / reactivate (atomic profile + users sync + audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_platform_user(
  p_subject_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_write_ops_for_tenant((SELECT tenant_id FROM public.profiles WHERE user_id = v_actor)) THEN
    RAISE EXCEPTION 'Not authorized to deactivate users';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Deactivation reason is required';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_subject_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  v_tenant := v_profile.tenant_id;

  IF NOT public.can_write_ops_for_tenant(v_tenant) THEN
    RAISE EXCEPTION 'Tenant scope denied';
  END IF;

  UPDATE public.profiles
  SET active = false, updated_at = now()
  WHERE user_id = p_subject_user_id;

  UPDATE public.users
  SET active = false
  WHERE tenant_id = v_tenant AND user_code = p_subject_user_id::text;

  INSERT INTO public.user_provisioning_events (
    hq_tenant_id, subject_user_id, event_type, actor_user_id, payload
  ) VALUES (
    v_tenant,
    p_subject_user_id,
    'deactivated',
    v_actor,
    jsonb_build_object('reason', btrim(p_reason))
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_subject_user_id, 'active', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_platform_user(
  p_subject_user_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE user_id = p_subject_user_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  IF NOT public.can_write_ops_for_tenant(v_tenant) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles SET active = true, updated_at = now() WHERE user_id = p_subject_user_id;
  UPDATE public.users SET active = true
  WHERE tenant_id = v_tenant AND user_code = p_subject_user_id::text;

  INSERT INTO public.user_provisioning_events (
    hq_tenant_id, subject_user_id, event_type, actor_user_id, payload
  ) VALUES (
    v_tenant,
    p_subject_user_id,
    'reactivated',
    v_actor,
    jsonb_build_object('note', NULLIF(btrim(p_note), ''))
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_subject_user_id, 'active', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_platform_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_platform_user(uuid, text) TO authenticated;
