-- Operations Center V2: agent-to-distributor primary assignments.
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

CREATE TABLE IF NOT EXISTS public.agent_distributor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  distributor_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_user_id uuid NOT NULL,
  agent_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_distributor_assignments_tenant_idx
  ON public.agent_distributor_assignments (tenant_id);

CREATE INDEX IF NOT EXISTS agent_distributor_assignments_agent_idx
  ON public.agent_distributor_assignments (agent_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_distributor_assignments_one_active_per_distributor
  ON public.agent_distributor_assignments (distributor_id)
  WHERE active = true;

DROP TRIGGER IF EXISTS agent_distributor_assignments_set_updated_at ON public.agent_distributor_assignments;
CREATE TRIGGER agent_distributor_assignments_set_updated_at
  BEFORE UPDATE ON public.agent_distributor_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agent_distributor_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_distributor_assignments_select_admin" ON public.agent_distributor_assignments;
DROP POLICY IF EXISTS "agent_distributor_assignments_write_admin" ON public.agent_distributor_assignments;

CREATE POLICY "agent_distributor_assignments_select_admin"
  ON public.agent_distributor_assignments FOR SELECT TO authenticated
  USING (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(tenant_id)
  );

CREATE POLICY "agent_distributor_assignments_write_admin"
  ON public.agent_distributor_assignments FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));
