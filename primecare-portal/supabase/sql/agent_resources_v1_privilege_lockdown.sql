-- PrimeCare Agent Resources V1 privilege lockdown (AR-1A live QA finding).
-- Supabase default privileges grant ALL on new public tables to authenticated,
-- which overrode the intended SELECT/INSERT + column UPDATE contract.
-- Idempotent. Do not apply to Production from AR-1A without founder cert.
-- Track A: supabase/sql/agent_resources_v1_privilege_lockdown.sql
-- Track B: supabase/migrations/20260831201000_agent_resources_v1_privilege_lockdown.sql

REVOKE ALL ON TABLE public.agent_resources FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resources FROM anon;
REVOKE ALL ON TABLE public.agent_resources FROM authenticated;
REVOKE ALL ON TABLE public.agent_resource_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resource_versions FROM anon;
REVOKE ALL ON TABLE public.agent_resource_versions FROM authenticated;
REVOKE ALL ON TABLE public.agent_resource_audiences FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resource_audiences FROM anon;
REVOKE ALL ON TABLE public.agent_resource_audiences FROM authenticated;
REVOKE ALL ON TABLE public.agent_resource_acknowledgements FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resource_acknowledgements FROM anon;
REVOKE ALL ON TABLE public.agent_resource_acknowledgements FROM authenticated;

GRANT SELECT, INSERT ON TABLE public.agent_resources TO authenticated;
GRANT UPDATE (
  title,
  description,
  category,
  required_reading,
  audience_type,
  archived_at,
  updated_at
) ON TABLE public.agent_resources TO authenticated;

GRANT SELECT, INSERT ON TABLE public.agent_resource_versions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_resource_audiences TO authenticated;

GRANT SELECT, INSERT ON TABLE public.agent_resource_acknowledgements TO authenticated;

REVOKE ALL ON FUNCTION public.agent_resource_is_publisher(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_version_visible_to_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_path_tenant_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_path_resource_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_path_version_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_storage_can_read(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_storage_can_insert(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_agent_resource_version(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_profile_tenant_matches() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agent_resource_is_publisher(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_version_visible_to_agent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_path_tenant_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_path_resource_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_path_version_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_storage_can_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_storage_can_insert(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_agent_resource_version(uuid) TO authenticated;
