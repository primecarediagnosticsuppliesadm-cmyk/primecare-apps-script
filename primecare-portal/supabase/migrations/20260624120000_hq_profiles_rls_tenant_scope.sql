-- HQ GREEN remediation: tenant-scoped profiles RLS for Admin; Executive retains cross-tenant read.
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_write" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_scoped" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_scoped" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_scoped" ON public.profiles;

-- Own profile always readable.
-- Admin: same-tenant profiles only.
-- Executive: all profiles (HQ operations / distributor provisioning visibility).
CREATE POLICY "profiles_select_scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

CREATE POLICY "profiles_insert_scoped"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

CREATE POLICY "profiles_update_scoped"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

CREATE POLICY "profiles_delete_scoped"
  ON public.profiles FOR DELETE TO authenticated
  USING (
    (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

COMMENT ON POLICY "profiles_select_scoped" ON public.profiles IS
  'HQ GREEN: Admin tenant-scoped; Executive global read; users read own profile.';
