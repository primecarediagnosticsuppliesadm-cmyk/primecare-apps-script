-- User & Role Provisioning Phase 3C: lab_ownership durable model + ownership audit events.
-- Run after user_provisioning_phase3b_migration.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Lab ownership (one ACTIVE row per lab per HQ tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lab_tenant_id uuid NOT NULL,
  lab_id text NOT NULL,
  primary_agent_id text NOT NULL,
  secondary_agent_id text,
  manager_id uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lab_ownership_active_unique_idx
  ON public.lab_ownership (tenant_id, lab_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS lab_ownership_tenant_lab_idx
  ON public.lab_ownership (tenant_id, lab_id, status);

CREATE INDEX IF NOT EXISTS lab_ownership_primary_agent_idx
  ON public.lab_ownership (tenant_id, primary_agent_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS lab_ownership_manager_idx
  ON public.lab_ownership (tenant_id, manager_id)
  WHERE status = 'ACTIVE';

COMMENT ON TABLE public.lab_ownership IS
  'Durable lab ownership slots — primary agent required; secondary + manager optional.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.lab_ownership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_ownership_select_admin" ON public.lab_ownership;
CREATE POLICY "lab_ownership_select_admin"
  ON public.lab_ownership FOR SELECT TO authenticated
  USING (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(tenant_id)
  );

DROP POLICY IF EXISTS "lab_ownership_insert_admin" ON public.lab_ownership;
CREATE POLICY "lab_ownership_insert_admin"
  ON public.lab_ownership FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "lab_ownership_update_admin" ON public.lab_ownership;
CREATE POLICY "lab_ownership_update_admin"
  ON public.lab_ownership FOR UPDATE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Ownership audit event types
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
      'ownership_reassigned',
      'ownership_assigned',
      'ownership_transferred',
      'ownership_removed',
      'ownership_secondary_added',
      'ownership_secondary_removed'
    )
  );

-- ---------------------------------------------------------------------------
-- Atomic assign / transfer (deactivate prior ACTIVE, insert new ACTIVE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_lab_ownership(
  p_tenant_id uuid,
  p_lab_tenant_id uuid,
  p_lab_id text,
  p_primary_agent_id text,
  p_secondary_agent_id text DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_assigned_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.lab_ownership%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_lab_tenant_id IS NULL OR trim(p_lab_id) = '' OR trim(p_primary_agent_id) = '' THEN
    RAISE EXCEPTION 'tenant_id, lab_tenant_id, lab_id, and primary_agent_id are required';
  END IF;

  IF NOT public.can_write_ops_for_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Not authorized to assign ownership for this tenant';
  END IF;

  UPDATE public.lab_ownership
  SET status = 'INACTIVE', updated_at = v_now
  WHERE tenant_id = p_tenant_id
    AND lab_id = trim(p_lab_id)
    AND status = 'ACTIVE';

  INSERT INTO public.lab_ownership (
    tenant_id,
    lab_tenant_id,
    lab_id,
    primary_agent_id,
    secondary_agent_id,
    manager_id,
    assigned_at,
    assigned_by,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_tenant_id,
    p_lab_tenant_id,
    trim(p_lab_id),
    trim(p_primary_agent_id),
    NULLIF(trim(p_secondary_agent_id), ''),
    p_manager_id,
    v_now,
    COALESCE(p_assigned_by, auth.uid()),
    'ACTIVE',
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'tenantId', v_row.tenant_id,
    'labTenantId', v_row.lab_tenant_id,
    'labId', v_row.lab_id,
    'primaryAgentId', v_row.primary_agent_id,
    'secondaryAgentId', v_row.secondary_agent_id,
    'managerId', v_row.manager_id,
    'status', v_row.status,
    'assignedAt', v_row.assigned_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_lab_ownership(uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_lab_ownership(uuid, uuid, text, text, text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_lab_ownership(
  p_tenant_id uuid,
  p_lab_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_count int;
BEGIN
  IF NOT public.can_write_ops_for_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.lab_ownership
  SET status = 'INACTIVE', updated_at = v_now
  WHERE tenant_id = p_tenant_id
    AND lab_id = trim(p_lab_id)
    AND status = 'ACTIVE';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deactivated', v_count > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_lab_ownership(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_lab_ownership(uuid, text) TO authenticated;
