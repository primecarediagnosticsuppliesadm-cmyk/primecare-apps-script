-- User & Role Provisioning Phase 3A: distributor_manager + read_only_auditor roles.
-- Run after user_provisioning_v1_migration.sql. Idempotent.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (lower(role) IN (
    'admin',
    'executive',
    'agent',
    'lab',
    'distributor_admin',
    'distributor_manager',
    'read_only_auditor'
  ));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'ADMIN'::text,
    'EXECUTIVE'::text,
    'AGENT'::text,
    'LAB'::text,
    'DISTRIBUTOR_ADMIN'::text,
    'DISTRIBUTOR_MANAGER'::text,
    'READ_ONLY_AUDITOR'::text
  ]));

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'Phase 3A — seven platform roles including distributor_manager and read_only_auditor.';
