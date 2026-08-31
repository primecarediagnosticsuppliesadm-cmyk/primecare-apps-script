-- PrimeCare Agent Resources V1 visibility fix (AR-1A live QA finding).
-- PostgreSQL composite IS NOT NULL is false when any profile column is null
-- (e.g. agents with null lab_id). That hid current published versions from agents.
-- Idempotent CREATE OR REPLACE. Do not apply to Production from AR-1A without founder cert.

CREATE OR REPLACE FUNCTION public.agent_resource_version_visible_to_agent(
  p_resource_id uuid,
  p_version_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_role() = 'agent'
    AND (public.current_profile()).user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.agent_resources r
      INNER JOIN public.agent_resource_versions v
        ON v.id = r.current_published_version_id
       AND v.resource_id = r.id
       AND v.tenant_id = r.tenant_id
      WHERE r.id = p_resource_id
        AND v.id = p_version_id
        AND public.tenant_id_matches(r.tenant_id)
        AND r.archived_at IS NULL
        AND v.status = 'published'
        AND (
          r.audience_type = 'all_agents'
          OR EXISTS (
            SELECT 1
            FROM public.agent_resource_audiences a
            WHERE a.resource_id = r.id
              AND a.tenant_id = r.tenant_id
              AND a.profile_user_id = auth.uid()
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.agent_resource_version_visible_to_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_version_visible_to_agent(uuid, uuid) TO authenticated;
