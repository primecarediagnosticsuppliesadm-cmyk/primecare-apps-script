-- PrimeCare Executive Compensation & Payroll foundation.
-- Foundation only: schema, lifecycle constraints, RLS helpers/policies, HR role constraint.
-- No payroll calculations, commission calculations, accounting entries, or O2C mutations.

-- ---------------------------------------------------------------------------
-- HR role foundation
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (lower(role) IN (
    'admin',
    'executive',
    'hr',
    'agent',
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
        'LAB'::text,
        'DISTRIBUTOR_ADMIN'::text,
        'DISTRIBUTOR_MANAGER'::text,
        'READ_ONLY_AUDITOR'::text
      ]));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compensation_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(COALESCE(public.current_user_role(), ''));
$$;

CREATE OR REPLACE FUNCTION public.compensation_agent_matches(
  row_agent_id text,
  row_profile_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.compensation_role() = 'agent'
    AND (
      (
        NULLIF(btrim(COALESCE(row_agent_id, '')), '') IS NOT NULL
        AND NULLIF(btrim(COALESCE(row_agent_id, '')), '') = public.current_profile_agent_id()
      )
      OR (
        row_profile_user_id IS NOT NULL
        AND row_profile_user_id = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.compensation_can_select_tenant(
  target_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_tenant_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.compensation_role() = 'executive'
      OR (
        public.compensation_role() IN ('hr', 'admin')
        AND public.tenant_id_matches(target_tenant_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.compensation_can_support_tenant(
  target_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_tenant_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.compensation_role() = 'executive'
      OR (
        public.compensation_role() = 'hr'
        AND public.tenant_id_matches(target_tenant_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.compensation_can_approve_tenant(
  target_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_tenant_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND public.compensation_role() = 'executive';
$$;

CREATE OR REPLACE FUNCTION public.compensation_agent_line_visible(
  row_agent_id text,
  row_profile_user_id uuid,
  row_status text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.compensation_agent_matches(row_agent_id, row_profile_user_id)
    AND lower(COALESCE(row_status, '')) IN ('locked', 'exported');
$$;

GRANT EXECUTE ON FUNCTION public.compensation_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensation_agent_matches(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensation_can_select_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensation_can_support_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensation_can_approve_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensation_agent_line_visible(text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compensation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  version text NOT NULL DEFAULT 'v1',
  role_scope text NOT NULL DEFAULT 'agent',
  effective_from date NOT NULL,
  effective_to date,
  base_salary numeric(14, 2) NOT NULL DEFAULT 0,
  fuel_allowance numeric(14, 2) NOT NULL DEFAULT 0,
  mobile_allowance numeric(14, 2) NOT NULL DEFAULT 0,
  commission_rate_bps integer NOT NULL DEFAULT 0,
  promotion_salary numeric(14, 2) NOT NULL DEFAULT 0,
  promotion_commission_rate_bps integer NOT NULL DEFAULT 0,
  promotion_collection_threshold numeric(14, 2) NOT NULL DEFAULT 0,
  promotion_min_efficiency_pct numeric(6, 2) NOT NULL DEFAULT 0,
  promotion_max_overdue_days integer NOT NULL DEFAULT 90,
  rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compensation_plans_status_check CHECK (status IN ('draft', 'active', 'retired')),
  CONSTRAINT compensation_plans_effective_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT compensation_plans_rates_check CHECK (
    commission_rate_bps >= 0
    AND promotion_commission_rate_bps >= 0
    AND promotion_min_efficiency_pct >= 0
    AND promotion_min_efficiency_pct <= 100
  ),
  CONSTRAINT compensation_plans_code_version_key UNIQUE (tenant_id, plan_code, version)
);

CREATE TABLE IF NOT EXISTS public.compensation_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.compensation_plans(id) ON DELETE RESTRICT,
  profile_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  agent_name text,
  assignment_status text NOT NULL DEFAULT 'active',
  start_date date NOT NULL,
  end_date date,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compensation_plan_assignments_status_check CHECK (
    assignment_status IN ('active', 'ended', 'suspended')
  ),
  CONSTRAINT compensation_plan_assignments_date_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_ym text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date,
  status text NOT NULL DEFAULT 'draft',
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  exported_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_periods_status_check CHECK (
    status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'void')
  ),
  CONSTRAINT payroll_periods_period_check CHECK (period_ym ~ '^\d{4}-\d{2}$'),
  CONSTRAINT payroll_periods_date_check CHECK (period_end >= period_start),
  CONSTRAINT payroll_periods_tenant_period_key UNIQUE (tenant_id, period_ym)
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  run_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  exported_at timestamptz,
  totals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_status_check CHECK (
    status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'void')
  ),
  CONSTRAINT payroll_runs_number_check CHECK (run_number > 0),
  CONSTRAINT payroll_runs_tenant_period_run_key UNIQUE (tenant_id, period_id, run_number)
);

CREATE TABLE IF NOT EXISTS public.compensation_attribution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  payment_id text,
  payment_ref text,
  payment_date date,
  lab_id text,
  lab_name text,
  agent_id text,
  agent_name text,
  profile_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attribution_method text NOT NULL DEFAULT 'manual_snapshot',
  ownership_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_version text,
  source_hash text,
  calculated_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compensation_attribution_method_check CHECK (
    attribution_method IN ('payment_agent_id', 'lab_ownership_snapshot', 'manual_snapshot')
  )
);

CREATE TABLE IF NOT EXISTS public.compensation_commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  attribution_snapshot_id uuid REFERENCES public.compensation_attribution_snapshots(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  agent_name text,
  profile_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attribution_method text NOT NULL DEFAULT 'manual_snapshot',
  attributable_cash_collected numeric(14, 2) NOT NULL DEFAULT 0,
  commission_rate_bps integer NOT NULL DEFAULT 0,
  commission_amount numeric(14, 2) NOT NULL DEFAULT 0,
  eligibility_status text NOT NULL DEFAULT 'manual_review',
  blocked_reason text,
  source_payment_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_hash text,
  rule_version text,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compensation_commission_entries_status_check CHECK (
    status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'void')
  ),
  CONSTRAINT compensation_commission_entries_eligibility_check CHECK (
    eligibility_status IN ('eligible', 'blocked', 'manual_review')
  ),
  CONSTRAINT compensation_commission_entries_amount_check CHECK (
    attributable_cash_collected >= 0 AND commission_rate_bps >= 0 AND commission_amount >= 0
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  plan_assignment_id uuid REFERENCES public.compensation_plan_assignments(id) ON DELETE SET NULL,
  commission_entry_id uuid REFERENCES public.compensation_commission_entries(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  agent_name text,
  profile_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  salary_amount numeric(14, 2) NOT NULL DEFAULT 0,
  fuel_allowance numeric(14, 2) NOT NULL DEFAULT 0,
  mobile_allowance numeric(14, 2) NOT NULL DEFAULT 0,
  commission_amount numeric(14, 2) NOT NULL DEFAULT 0,
  collection_incentive numeric(14, 2) NOT NULL DEFAULT 0,
  delivery_incentive numeric(14, 2) NOT NULL DEFAULT 0,
  qualification_incentive numeric(14, 2) NOT NULL DEFAULT 0,
  attendance_incentive numeric(14, 2) NOT NULL DEFAULT 0,
  quarterly_bonus numeric(14, 2) NOT NULL DEFAULT 0,
  annual_bonus numeric(14, 2) NOT NULL DEFAULT 0,
  manual_adjustments_total numeric(14, 2) NOT NULL DEFAULT 0,
  penalties_total numeric(14, 2) NOT NULL DEFAULT 0,
  recoveries_total numeric(14, 2) NOT NULL DEFAULT 0,
  gross_pay numeric(14, 2) NOT NULL DEFAULT 0,
  deductions_total numeric(14, 2) NOT NULL DEFAULT 0,
  net_payable numeric(14, 2) NOT NULL DEFAULT 0,
  line_status text NOT NULL DEFAULT 'draft',
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_run_lines_status_check CHECK (
    line_status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'void')
  )
);

CREATE TABLE IF NOT EXISTS public.compensation_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  payroll_run_line_id uuid REFERENCES public.payroll_run_lines(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  agent_name text,
  profile_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  adjustment_type text NOT NULL,
  component text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  reason text NOT NULL,
  notes text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compensation_adjustments_type_check CHECK (
    adjustment_type IN ('manual_adjustment', 'penalty', 'recovery')
  ),
  CONSTRAINT compensation_adjustments_status_check CHECK (
    status IN ('draft', 'submitted', 'approved', 'rejected', 'void')
  ),
  CONSTRAINT compensation_adjustments_reason_check CHECK (length(btrim(reason)) > 0)
);

CREATE TABLE IF NOT EXISTS public.compensation_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  before_json jsonb,
  after_json jsonb,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compensation_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  payroll_run_line_id uuid REFERENCES public.payroll_run_lines(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  reason text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compensation_approval_events_action_check CHECK (
    action IN ('submit', 'approve', 'reject', 'request_changes', 'lock', 'export', 'void')
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  export_format text NOT NULL DEFAULT 'csv',
  storage_path text,
  checksum text,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'generated',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_exports_status_check CHECK (status IN ('generated', 'downloaded', 'void')),
  CONSTRAINT payroll_exports_format_check CHECK (export_format IN ('csv', 'bank_file', 'pdf_summary'))
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_compensation_plans_tenant_status
  ON public.compensation_plans (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_compensation_plan_assignments_tenant_agent
  ON public.compensation_plan_assignments (tenant_id, agent_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant_period
  ON public.payroll_periods (tenant_id, period_ym);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_period_status
  ON public.payroll_runs (tenant_id, period_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_tenant_run
  ON public.payroll_run_lines (tenant_id, payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_tenant_agent
  ON public.payroll_run_lines (tenant_id, agent_id, line_status);
CREATE INDEX IF NOT EXISTS idx_compensation_commission_entries_tenant_period_agent
  ON public.compensation_commission_entries (tenant_id, period_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_compensation_attribution_snapshots_tenant_payment
  ON public.compensation_attribution_snapshots (tenant_id, payment_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_compensation_adjustments_tenant_agent
  ON public.compensation_adjustments (tenant_id, agent_id, status);
CREATE INDEX IF NOT EXISTS idx_compensation_audit_events_tenant_created
  ON public.compensation_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compensation_approval_events_tenant_run
  ON public.compensation_approval_events (tenant_id, payroll_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_exports_tenant_run
  ON public.payroll_exports (tenant_id, payroll_run_id, status);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS compensation_plans_set_updated_at ON public.compensation_plans;
CREATE TRIGGER compensation_plans_set_updated_at
  BEFORE UPDATE ON public.compensation_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS compensation_plan_assignments_set_updated_at ON public.compensation_plan_assignments;
CREATE TRIGGER compensation_plan_assignments_set_updated_at
  BEFORE UPDATE ON public.compensation_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payroll_periods_set_updated_at ON public.payroll_periods;
CREATE TRIGGER payroll_periods_set_updated_at
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payroll_runs_set_updated_at ON public.payroll_runs;
CREATE TRIGGER payroll_runs_set_updated_at
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS compensation_commission_entries_set_updated_at ON public.compensation_commission_entries;
CREATE TRIGGER compensation_commission_entries_set_updated_at
  BEFORE UPDATE ON public.compensation_commission_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payroll_run_lines_set_updated_at ON public.payroll_run_lines;
CREATE TRIGGER payroll_run_lines_set_updated_at
  BEFORE UPDATE ON public.payroll_run_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS compensation_adjustments_set_updated_at ON public.compensation_adjustments;
CREATE TRIGGER compensation_adjustments_set_updated_at
  BEFORE UPDATE ON public.compensation_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payroll_exports_set_updated_at ON public.payroll_exports;
CREATE TRIGGER payroll_exports_set_updated_at
  BEFORE UPDATE ON public.payroll_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.compensation_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.compensation_plan_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_run_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.compensation_commission_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.compensation_adjustments TO authenticated;
GRANT SELECT, INSERT ON public.compensation_attribution_snapshots TO authenticated;
GRANT SELECT, INSERT ON public.compensation_audit_events TO authenticated;
GRANT SELECT, INSERT ON public.compensation_approval_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_exports TO authenticated;

ALTER TABLE public.compensation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_run_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_attribution_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compensation_plans_select ON public.compensation_plans;
DROP POLICY IF EXISTS compensation_plans_insert ON public.compensation_plans;
DROP POLICY IF EXISTS compensation_plans_update ON public.compensation_plans;
DROP POLICY IF EXISTS compensation_plan_assignments_select ON public.compensation_plan_assignments;
DROP POLICY IF EXISTS compensation_plan_assignments_insert ON public.compensation_plan_assignments;
DROP POLICY IF EXISTS compensation_plan_assignments_update ON public.compensation_plan_assignments;
DROP POLICY IF EXISTS payroll_periods_select ON public.payroll_periods;
DROP POLICY IF EXISTS payroll_periods_insert ON public.payroll_periods;
DROP POLICY IF EXISTS payroll_periods_update ON public.payroll_periods;
DROP POLICY IF EXISTS payroll_runs_select ON public.payroll_runs;
DROP POLICY IF EXISTS payroll_runs_insert ON public.payroll_runs;
DROP POLICY IF EXISTS payroll_runs_update ON public.payroll_runs;
DROP POLICY IF EXISTS payroll_run_lines_select ON public.payroll_run_lines;
DROP POLICY IF EXISTS payroll_run_lines_insert ON public.payroll_run_lines;
DROP POLICY IF EXISTS payroll_run_lines_update ON public.payroll_run_lines;
DROP POLICY IF EXISTS compensation_commission_entries_select ON public.compensation_commission_entries;
DROP POLICY IF EXISTS compensation_commission_entries_insert ON public.compensation_commission_entries;
DROP POLICY IF EXISTS compensation_commission_entries_update ON public.compensation_commission_entries;
DROP POLICY IF EXISTS compensation_adjustments_select ON public.compensation_adjustments;
DROP POLICY IF EXISTS compensation_adjustments_insert ON public.compensation_adjustments;
DROP POLICY IF EXISTS compensation_adjustments_update ON public.compensation_adjustments;
DROP POLICY IF EXISTS compensation_attribution_snapshots_select ON public.compensation_attribution_snapshots;
DROP POLICY IF EXISTS compensation_attribution_snapshots_insert ON public.compensation_attribution_snapshots;
DROP POLICY IF EXISTS compensation_audit_events_select ON public.compensation_audit_events;
DROP POLICY IF EXISTS compensation_audit_events_insert ON public.compensation_audit_events;
DROP POLICY IF EXISTS compensation_approval_events_select ON public.compensation_approval_events;
DROP POLICY IF EXISTS compensation_approval_events_insert ON public.compensation_approval_events;
DROP POLICY IF EXISTS payroll_exports_select ON public.payroll_exports;
DROP POLICY IF EXISTS payroll_exports_insert ON public.payroll_exports;
DROP POLICY IF EXISTS payroll_exports_update ON public.payroll_exports;

-- Plans
CREATE POLICY compensation_plans_select
  ON public.compensation_plans FOR SELECT TO authenticated
  USING (
    public.compensation_can_select_tenant(tenant_id)
    OR (tenant_id IS NULL AND public.compensation_role() IN ('executive', 'hr', 'admin'))
  );
CREATE POLICY compensation_plans_insert
  ON public.compensation_plans FOR INSERT TO authenticated
  WITH CHECK (
    public.compensation_can_support_tenant(tenant_id)
    OR (tenant_id IS NULL AND public.compensation_role() IN ('executive', 'hr'))
  );
CREATE POLICY compensation_plans_update
  ON public.compensation_plans FOR UPDATE TO authenticated
  USING (
    public.compensation_can_support_tenant(tenant_id)
    OR (tenant_id IS NULL AND public.compensation_role() IN ('executive', 'hr'))
  )
  WITH CHECK (
    public.compensation_can_support_tenant(tenant_id)
    OR (tenant_id IS NULL AND public.compensation_role() IN ('executive', 'hr'))
  );

-- Assignment tables
CREATE POLICY compensation_plan_assignments_select
  ON public.compensation_plan_assignments FOR SELECT TO authenticated
  USING (
    public.compensation_can_select_tenant(tenant_id)
    OR public.compensation_agent_matches(agent_id, profile_user_id)
  );
CREATE POLICY compensation_plan_assignments_insert
  ON public.compensation_plan_assignments FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));
CREATE POLICY compensation_plan_assignments_update
  ON public.compensation_plan_assignments FOR UPDATE TO authenticated
  USING (public.compensation_can_support_tenant(tenant_id))
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));

-- Periods and runs
CREATE POLICY payroll_periods_select
  ON public.payroll_periods FOR SELECT TO authenticated
  USING (public.compensation_can_select_tenant(tenant_id));
CREATE POLICY payroll_periods_insert
  ON public.payroll_periods FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));
CREATE POLICY payroll_periods_update
  ON public.payroll_periods FOR UPDATE TO authenticated
  USING (public.compensation_can_support_tenant(tenant_id))
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));

CREATE POLICY payroll_runs_select
  ON public.payroll_runs FOR SELECT TO authenticated
  USING (public.compensation_can_select_tenant(tenant_id));
CREATE POLICY payroll_runs_insert
  ON public.payroll_runs FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));
CREATE POLICY payroll_runs_update
  ON public.payroll_runs FOR UPDATE TO authenticated
  USING (public.compensation_can_support_tenant(tenant_id))
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));

-- Agent-visible line-bearing tables
CREATE POLICY payroll_run_lines_select
  ON public.payroll_run_lines FOR SELECT TO authenticated
  USING (
    public.compensation_can_select_tenant(tenant_id)
    OR public.compensation_agent_line_visible(agent_id, profile_user_id, line_status)
  );
CREATE POLICY payroll_run_lines_insert
  ON public.payroll_run_lines FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));
CREATE POLICY payroll_run_lines_update
  ON public.payroll_run_lines FOR UPDATE TO authenticated
  USING (public.compensation_can_support_tenant(tenant_id))
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));

CREATE POLICY compensation_commission_entries_select
  ON public.compensation_commission_entries FOR SELECT TO authenticated
  USING (
    public.compensation_can_select_tenant(tenant_id)
    OR public.compensation_agent_line_visible(agent_id, profile_user_id, status)
  );
CREATE POLICY compensation_commission_entries_insert
  ON public.compensation_commission_entries FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));
CREATE POLICY compensation_commission_entries_update
  ON public.compensation_commission_entries FOR UPDATE TO authenticated
  USING (public.compensation_can_support_tenant(tenant_id))
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));

CREATE POLICY compensation_adjustments_select
  ON public.compensation_adjustments FOR SELECT TO authenticated
  USING (
    public.compensation_can_select_tenant(tenant_id)
    OR (
      public.compensation_agent_matches(agent_id, profile_user_id)
      AND status IN ('approved')
    )
  );
CREATE POLICY compensation_adjustments_insert
  ON public.compensation_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));
CREATE POLICY compensation_adjustments_update
  ON public.compensation_adjustments FOR UPDATE TO authenticated
  USING (public.compensation_can_support_tenant(tenant_id))
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));

-- Snapshot, audit, approval, export
CREATE POLICY compensation_attribution_snapshots_select
  ON public.compensation_attribution_snapshots FOR SELECT TO authenticated
  USING (
    public.compensation_can_select_tenant(tenant_id)
    OR public.compensation_agent_matches(agent_id, profile_user_id)
  );
CREATE POLICY compensation_attribution_snapshots_insert
  ON public.compensation_attribution_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_support_tenant(tenant_id));

CREATE POLICY compensation_audit_events_select
  ON public.compensation_audit_events FOR SELECT TO authenticated
  USING (
    public.compensation_can_select_tenant(tenant_id)
    OR public.compensation_role() = 'executive'
  );
CREATE POLICY compensation_audit_events_insert
  ON public.compensation_audit_events FOR INSERT TO authenticated
  WITH CHECK (
    public.compensation_can_support_tenant(tenant_id)
    OR public.compensation_can_approve_tenant(tenant_id)
  );

CREATE POLICY compensation_approval_events_select
  ON public.compensation_approval_events FOR SELECT TO authenticated
  USING (public.compensation_can_select_tenant(tenant_id));
CREATE POLICY compensation_approval_events_insert
  ON public.compensation_approval_events FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));

CREATE POLICY payroll_exports_select
  ON public.payroll_exports FOR SELECT TO authenticated
  USING (public.compensation_can_select_tenant(tenant_id));
CREATE POLICY payroll_exports_insert
  ON public.payroll_exports FOR INSERT TO authenticated
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));
CREATE POLICY payroll_exports_update
  ON public.payroll_exports FOR UPDATE TO authenticated
  USING (public.compensation_can_approve_tenant(tenant_id))
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));

COMMENT ON TABLE public.compensation_commission_entries IS
  'Cash-only compensation commission foundation. Existing commission_entries is not payroll source of truth.';
COMMENT ON TABLE public.compensation_attribution_snapshots IS
  'Auditable attribution snapshot infrastructure; no calculations are performed by this migration.';
