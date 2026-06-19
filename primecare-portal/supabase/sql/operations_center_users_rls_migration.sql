-- Operations Center V1: enable HQ admin CRUD on public.users (field agent registry).
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_write_admin" ON public.users;

CREATE POLICY "users_select_admin"
  ON public.users FOR SELECT TO authenticated
  USING (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(tenant_id)
  );

CREATE POLICY "users_write_admin"
  ON public.users FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));
