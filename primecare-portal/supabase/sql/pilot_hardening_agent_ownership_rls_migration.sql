-- Pilot Hardening — allow agents to read their own lab_ownership rows (primary + secondary).
-- Run after user_provisioning_phase3c_lab_ownership_migration.sql

DROP POLICY IF EXISTS "lab_ownership_select_agent" ON public.lab_ownership;

CREATE POLICY "lab_ownership_select_agent"
  ON public.lab_ownership FOR SELECT TO authenticated
  USING (
    lower(public.current_user_role()) = 'agent'
    AND status = 'ACTIVE'
    AND public.tenant_id_matches(tenant_id)
    AND (
      lower(COALESCE(primary_agent_id, '')) = lower(COALESCE(public.current_profile_agent_id(), ''))
      OR lower(COALESCE(secondary_agent_id, '')) = lower(COALESCE(public.current_profile_agent_id(), ''))
    )
  );
