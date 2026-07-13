-- Phase 7.1 — Enterprise Employee Compensation architecture.
-- Profile-primary assignments; agent_id optional except for agent role.
-- Non-destructive: backfills profile_user_id from existing agent profiles.

-- ---------------------------------------------------------------------------
-- Extend HQ employee profile roles (compensation-eligible)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (lower(role) IN (
    'admin',
    'executive',
    'hr',
    'agent',
    'warehouse',
    'delivery',
    'operations',
    'support',
    'lab',
    'distributor_admin',
    'distributor_manager',
    'read_only_auditor'
  ));

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role = ANY (ARRAY[
        'ADMIN'::text,
        'EXECUTIVE'::text,
        'HR'::text,
        'AGENT'::text,
        'WAREHOUSE'::text,
        'DELIVERY'::text,
        'OPERATIONS'::text,
        'SUPPORT'::text,
        'LAB'::text,
        'DISTRIBUTOR_ADMIN'::text,
        'DISTRIBUTOR_MANAGER'::text,
        'READ_ONLY_AUDITOR'::text
      ]));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Role-aware compensation plans
-- ---------------------------------------------------------------------------
ALTER TABLE public.compensation_plans DROP CONSTRAINT IF EXISTS compensation_plans_role_scope_check;
ALTER TABLE public.compensation_plans ADD CONSTRAINT compensation_plans_role_scope_check
  CHECK (lower(role_scope) IN (
    'agent',
    'admin',
    'executive',
    'hr',
    'warehouse',
    'delivery',
    'operations',
    'support',
    'future'
  ));

-- ---------------------------------------------------------------------------
-- Profile-primary plan assignments
-- ---------------------------------------------------------------------------
ALTER TABLE public.compensation_plan_assignments
  ADD COLUMN IF NOT EXISTS employee_name text,
  ADD COLUMN IF NOT EXISTS employee_role text;

UPDATE public.compensation_plan_assignments AS a
SET
  profile_user_id = p.user_id,
  employee_name = COALESCE(a.employee_name, a.agent_name, p.agent_name, p.display_name, p.username),
  employee_role = COALESCE(NULLIF(lower(btrim(a.employee_role)), ''), lower(p.role), 'agent')
FROM public.profiles AS p
WHERE a.profile_user_id IS NULL
  AND NULLIF(btrim(a.agent_id), '') IS NOT NULL
  AND p.agent_id = a.agent_id
  AND p.tenant_id = a.tenant_id;

UPDATE public.compensation_plan_assignments
SET
  employee_name = COALESCE(employee_name, agent_name, agent_id),
  employee_role = COALESCE(NULLIF(lower(btrim(employee_role)), ''), 'agent')
WHERE employee_name IS NULL OR employee_role IS NULL;

ALTER TABLE public.compensation_plan_assignments
  ALTER COLUMN agent_id DROP NOT NULL;

ALTER TABLE public.compensation_plan_assignments DROP CONSTRAINT IF EXISTS compensation_plan_assignments_identity_check;
ALTER TABLE public.compensation_plan_assignments ADD CONSTRAINT compensation_plan_assignments_identity_check
  CHECK (profile_user_id IS NOT NULL);

ALTER TABLE public.compensation_plan_assignments DROP CONSTRAINT IF EXISTS compensation_plan_assignments_agent_role_check;
ALTER TABLE public.compensation_plan_assignments ADD CONSTRAINT compensation_plan_assignments_agent_role_check
  CHECK (
    lower(COALESCE(employee_role, 'agent')) <> 'agent'
    OR NULLIF(btrim(COALESCE(agent_id, '')), '') IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_compensation_plan_assignments_tenant_profile
  ON public.compensation_plan_assignments (tenant_id, profile_user_id, assignment_status);

-- ---------------------------------------------------------------------------
-- Payroll lines: agent_id optional when profile_user_id is present
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_run_lines
  ALTER COLUMN agent_id DROP NOT NULL;

ALTER TABLE public.payroll_run_lines DROP CONSTRAINT IF EXISTS payroll_run_lines_identity_check;
ALTER TABLE public.payroll_run_lines ADD CONSTRAINT payroll_run_lines_identity_check
  CHECK (
    profile_user_id IS NOT NULL
    OR NULLIF(btrim(COALESCE(agent_id, '')), '') IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_tenant_profile
  ON public.payroll_run_lines (tenant_id, profile_user_id, period_id);
