-- PrimeCare Compensation Phase 3C.1 — Payroll domain RLS/workflow hardening.
-- Fixes review blockers: agent paid visibility, workflow RLS authority,
-- immutable transition column guards. Does not modify Finance/O2C tables.

-- ---------------------------------------------------------------------------
-- Agent own-history visibility includes paid
-- ---------------------------------------------------------------------------
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
    AND lower(COALESCE(row_status, '')) IN ('locked', 'exported', 'paid');
$$;

-- ---------------------------------------------------------------------------
-- Workflow transition helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compensation_payroll_hr_transition_allowed(
  old_status text,
  new_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    lower(COALESCE(old_status, '')) = 'draft'
      AND lower(COALESCE(new_status, '')) = 'previewed'
    OR lower(COALESCE(old_status, '')) = 'previewed'
      AND lower(COALESCE(new_status, '')) = 'submitted';
$$;

CREATE OR REPLACE FUNCTION public.compensation_payroll_executive_transition_allowed(
  old_status text,
  new_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    public.compensation_payroll_hr_transition_allowed(old_status, new_status)
    OR (
      lower(COALESCE(old_status, '')) = 'submitted'
      AND lower(COALESCE(new_status, '')) IN ('approved', 'draft')
    )
    OR (
      lower(COALESCE(old_status, '')) = 'approved'
      AND lower(COALESCE(new_status, '')) = 'locked'
    )
    OR (
      lower(COALESCE(old_status, '')) = 'locked'
      AND lower(COALESCE(new_status, '')) = 'exported'
    )
    OR (
      lower(COALESCE(old_status, '')) = 'exported'
      AND lower(COALESCE(new_status, '')) = 'paid'
    );
$$;

CREATE OR REPLACE FUNCTION public.payroll_run_header_fields_unchanged(
  old_row public.payroll_runs,
  new_row public.payroll_runs
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    old_row.tenant_id IS NOT DISTINCT FROM new_row.tenant_id
    AND old_row.period_id IS NOT DISTINCT FROM new_row.period_id
    AND old_row.run_number IS NOT DISTINCT FROM new_row.run_number
    AND old_row.generated_by IS NOT DISTINCT FROM new_row.generated_by
    AND old_row.generated_at IS NOT DISTINCT FROM new_row.generated_at
    AND old_row.submitted_by IS NOT DISTINCT FROM new_row.submitted_by
    AND old_row.submitted_at IS NOT DISTINCT FROM new_row.submitted_at
    AND old_row.approved_by IS NOT DISTINCT FROM new_row.approved_by
    AND old_row.approved_at IS NOT DISTINCT FROM new_row.approved_at
    AND old_row.locked_by IS NOT DISTINCT FROM new_row.locked_by
    AND old_row.locked_at IS NOT DISTINCT FROM new_row.locked_at
    AND old_row.totals_json IS NOT DISTINCT FROM new_row.totals_json;
$$;

CREATE OR REPLACE FUNCTION public.payroll_period_header_fields_unchanged(
  old_row public.payroll_periods,
  new_row public.payroll_periods
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    old_row.tenant_id IS NOT DISTINCT FROM new_row.tenant_id
    AND old_row.period_ym IS NOT DISTINCT FROM new_row.period_ym
    AND old_row.period_start IS NOT DISTINCT FROM new_row.period_start
    AND old_row.period_end IS NOT DISTINCT FROM new_row.period_end
    AND old_row.pay_date IS NOT DISTINCT FROM new_row.pay_date
    AND old_row.opened_by IS NOT DISTINCT FROM new_row.opened_by
    AND old_row.submitted_by IS NOT DISTINCT FROM new_row.submitted_by
    AND old_row.submitted_at IS NOT DISTINCT FROM new_row.submitted_at
    AND old_row.approved_by IS NOT DISTINCT FROM new_row.approved_by
    AND old_row.approved_at IS NOT DISTINCT FROM new_row.approved_at
    AND old_row.locked_by IS NOT DISTINCT FROM new_row.locked_by
    AND old_row.locked_at IS NOT DISTINCT FROM new_row.locked_at;
$$;

CREATE OR REPLACE FUNCTION public.payroll_line_financial_fields_unchanged(
  old_row public.payroll_run_lines,
  new_row public.payroll_run_lines
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    old_row.tenant_id IS NOT DISTINCT FROM new_row.tenant_id
    AND old_row.payroll_run_id IS NOT DISTINCT FROM new_row.payroll_run_id
    AND old_row.period_id IS NOT DISTINCT FROM new_row.period_id
    AND old_row.plan_assignment_id IS NOT DISTINCT FROM new_row.plan_assignment_id
    AND old_row.commission_entry_id IS NOT DISTINCT FROM new_row.commission_entry_id
    AND old_row.agent_id IS NOT DISTINCT FROM new_row.agent_id
    AND old_row.agent_name IS NOT DISTINCT FROM new_row.agent_name
    AND old_row.profile_user_id IS NOT DISTINCT FROM new_row.profile_user_id
    AND old_row.salary_amount IS NOT DISTINCT FROM new_row.salary_amount
    AND old_row.fuel_allowance IS NOT DISTINCT FROM new_row.fuel_allowance
    AND old_row.mobile_allowance IS NOT DISTINCT FROM new_row.mobile_allowance
    AND old_row.commission_amount IS NOT DISTINCT FROM new_row.commission_amount
    AND old_row.collection_incentive IS NOT DISTINCT FROM new_row.collection_incentive
    AND old_row.delivery_incentive IS NOT DISTINCT FROM new_row.delivery_incentive
    AND old_row.qualification_incentive IS NOT DISTINCT FROM new_row.qualification_incentive
    AND old_row.attendance_incentive IS NOT DISTINCT FROM new_row.attendance_incentive
    AND old_row.quarterly_bonus IS NOT DISTINCT FROM new_row.quarterly_bonus
    AND old_row.annual_bonus IS NOT DISTINCT FROM new_row.annual_bonus
    AND old_row.manual_adjustments_total IS NOT DISTINCT FROM new_row.manual_adjustments_total
    AND old_row.penalties_total IS NOT DISTINCT FROM new_row.penalties_total
    AND old_row.recoveries_total IS NOT DISTINCT FROM new_row.recoveries_total
    AND old_row.gross_pay IS NOT DISTINCT FROM new_row.gross_pay
    AND old_row.deductions_total IS NOT DISTINCT FROM new_row.deductions_total
    AND old_row.net_payable IS NOT DISTINCT FROM new_row.net_payable
    AND old_row.calculation_snapshot IS NOT DISTINCT FROM new_row.calculation_snapshot;
$$;

CREATE OR REPLACE FUNCTION public.commission_entry_financial_fields_unchanged(
  old_row public.compensation_commission_entries,
  new_row public.compensation_commission_entries
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    old_row.tenant_id IS NOT DISTINCT FROM new_row.tenant_id
    AND old_row.period_id IS NOT DISTINCT FROM new_row.period_id
    AND old_row.attribution_snapshot_id IS NOT DISTINCT FROM new_row.attribution_snapshot_id
    AND old_row.agent_id IS NOT DISTINCT FROM new_row.agent_id
    AND old_row.agent_name IS NOT DISTINCT FROM new_row.agent_name
    AND old_row.profile_user_id IS NOT DISTINCT FROM new_row.profile_user_id
    AND old_row.attribution_method IS NOT DISTINCT FROM new_row.attribution_method
    AND old_row.attributable_cash_collected IS NOT DISTINCT FROM new_row.attributable_cash_collected
    AND old_row.commission_rate_bps IS NOT DISTINCT FROM new_row.commission_rate_bps
    AND old_row.commission_amount IS NOT DISTINCT FROM new_row.commission_amount
    AND old_row.eligibility_status IS NOT DISTINCT FROM new_row.eligibility_status
    AND old_row.blocked_reason IS NOT DISTINCT FROM new_row.blocked_reason
    AND old_row.source_payment_refs IS NOT DISTINCT FROM new_row.source_payment_refs
    AND old_row.source_hash IS NOT DISTINCT FROM new_row.source_hash
    AND old_row.rule_version IS NOT DISTINCT FROM new_row.rule_version
    AND old_row.metadata IS NOT DISTINCT FROM new_row.metadata;
$$;

GRANT EXECUTE ON FUNCTION public.compensation_payroll_hr_transition_allowed(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensation_payroll_executive_transition_allowed(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Workflow RBAC trigger (blocks direct Supabase writes that bypass app layer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payroll_workflow_rbac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.compensation_role();
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF v_role IN ('admin', 'agent', 'lab', 'distributor_admin', 'distributor_manager', 'read_only_auditor') THEN
    RAISE EXCEPTION 'payroll_workflow_update_forbidden_for_%', v_role;
  END IF;

  IF v_role = 'hr' THEN
    IF NOT public.compensation_payroll_hr_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'payroll_hr_transition_forbidden_%_to_%', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'executive' THEN
    IF NOT public.compensation_payroll_executive_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'payroll_executive_transition_forbidden_%_to_%', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'payroll_workflow_update_forbidden_for_%', COALESCE(v_role, 'unknown');
END;
$$;

DROP TRIGGER IF EXISTS enforce_payroll_period_workflow_rbac_trigger ON public.payroll_periods;
CREATE TRIGGER enforce_payroll_period_workflow_rbac_trigger
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payroll_workflow_rbac();

DROP TRIGGER IF EXISTS enforce_payroll_run_workflow_rbac_trigger ON public.payroll_runs;
CREATE TRIGGER enforce_payroll_run_workflow_rbac_trigger
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payroll_workflow_rbac();

-- ---------------------------------------------------------------------------
-- Immutability triggers with column guards for locked/exported/paid progress
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_period_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.payroll_domain_is_immutable_status(OLD.status) THEN
      RAISE EXCEPTION 'payroll_period_immutable_after_lock';
    END IF;
    RETURN OLD;
  END IF;

  IF public.payroll_domain_is_immutable_status(OLD.status) THEN
    IF OLD.status = 'locked' AND NEW.status = 'exported' THEN
      IF NOT public.payroll_period_header_fields_unchanged(OLD, NEW) THEN
        RAISE EXCEPTION 'payroll_period_export_transition_header_mutation_blocked';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.status = 'exported' AND NEW.status = 'paid' THEN
      IF NOT public.payroll_period_header_fields_unchanged(OLD, NEW)
        OR OLD.exported_by IS DISTINCT FROM NEW.exported_by
        OR OLD.exported_at IS DISTINCT FROM NEW.exported_at THEN
        RAISE EXCEPTION 'payroll_period_paid_transition_header_mutation_blocked';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'payroll_period_immutable_after_lock';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.payroll_domain_is_immutable_status(OLD.status) THEN
      RAISE EXCEPTION 'payroll_run_immutable_after_lock';
    END IF;
    RETURN OLD;
  END IF;

  IF public.payroll_domain_is_immutable_status(OLD.status) THEN
    IF OLD.status = 'locked' AND NEW.status = 'exported' THEN
      IF NOT public.payroll_run_header_fields_unchanged(OLD, NEW) THEN
        RAISE EXCEPTION 'payroll_run_export_transition_header_mutation_blocked';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.status = 'exported' AND NEW.status = 'paid' THEN
      IF NOT public.payroll_run_header_fields_unchanged(OLD, NEW)
        OR OLD.exported_by IS DISTINCT FROM NEW.exported_by
        OR OLD.exported_at IS DISTINCT FROM NEW.exported_at THEN
        RAISE EXCEPTION 'payroll_run_paid_transition_header_mutation_blocked';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'payroll_run_immutable_after_lock';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_status text;
BEGIN
  v_parent_status := public.payroll_run_status_for_id(OLD.payroll_run_id);
  IF public.payroll_domain_is_immutable_status(OLD.line_status)
    OR public.payroll_domain_is_immutable_status(v_parent_status) THEN
    RAISE EXCEPTION 'payroll_line_immutable_after_lock';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NOT public.payroll_line_financial_fields_unchanged(OLD, NEW)
    AND public.compensation_role() <> 'executive' THEN
    RAISE EXCEPTION 'payroll_line_financial_update_executive_only';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_commission_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_status text;
BEGIN
  v_parent_status := public.payroll_run_status_for_commission_metadata(OLD.metadata);
  IF public.payroll_domain_is_immutable_status(OLD.status)
    OR public.payroll_domain_is_immutable_status(v_parent_status) THEN
    RAISE EXCEPTION 'commission_entry_immutable_after_lock';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NOT public.commission_entry_financial_fields_unchanged(OLD, NEW) THEN
    RAISE EXCEPTION 'commission_entry_financial_mutation_blocked';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_adjustment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_status text;
  v_role text := public.compensation_role();
BEGIN
  v_parent_status := public.payroll_run_status_for_id(OLD.payroll_run_id);
  IF public.payroll_domain_is_immutable_status(v_parent_status)
    OR OLD.status = 'approved' THEN
    RAISE EXCEPTION 'payroll_adjustment_immutable_after_approval_or_lock';
  END IF;

  IF TG_OP = 'UPDATE' AND v_role = 'hr' AND NEW.status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'payroll_adjustment_approval_executive_only';
  END IF;

  IF TG_OP = 'UPDATE' AND v_role IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'payroll_adjustment_update_forbidden_for_%', v_role;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tighten workflow update RLS policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payroll_periods_update ON public.payroll_periods;
DROP POLICY IF EXISTS payroll_runs_update ON public.payroll_runs;
DROP POLICY IF EXISTS payroll_run_lines_update ON public.payroll_run_lines;
DROP POLICY IF EXISTS compensation_commission_entries_update ON public.compensation_commission_entries;
DROP POLICY IF EXISTS compensation_adjustments_update ON public.compensation_adjustments;

CREATE POLICY payroll_periods_update_hr
  ON public.payroll_periods FOR UPDATE TO authenticated
  USING (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('draft', 'previewed')
  )
  WITH CHECK (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('previewed', 'submitted')
  );

CREATE POLICY payroll_periods_update_executive
  ON public.payroll_periods FOR UPDATE TO authenticated
  USING (public.compensation_can_approve_tenant(tenant_id))
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));

CREATE POLICY payroll_runs_update_hr
  ON public.payroll_runs FOR UPDATE TO authenticated
  USING (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('draft', 'previewed')
  )
  WITH CHECK (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('previewed', 'submitted')
  );

CREATE POLICY payroll_runs_update_executive
  ON public.payroll_runs FOR UPDATE TO authenticated
  USING (public.compensation_can_approve_tenant(tenant_id))
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));

CREATE POLICY payroll_run_lines_update_hr
  ON public.payroll_run_lines FOR UPDATE TO authenticated
  USING (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND line_status IN ('draft', 'previewed', 'submitted', 'approved')
    AND NOT public.payroll_domain_is_immutable_status(
      public.payroll_run_status_for_id(payroll_run_id)
    )
  )
  WITH CHECK (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND line_status IN ('draft', 'previewed', 'submitted', 'approved', 'locked')
  );

CREATE POLICY payroll_run_lines_update_executive
  ON public.payroll_run_lines FOR UPDATE TO authenticated
  USING (
    public.compensation_can_approve_tenant(tenant_id)
    AND NOT public.payroll_domain_is_immutable_status(line_status)
  )
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));

CREATE POLICY compensation_commission_entries_update_hr
  ON public.compensation_commission_entries FOR UPDATE TO authenticated
  USING (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('draft', 'previewed', 'submitted', 'approved')
    AND NOT public.payroll_domain_is_immutable_status(
      public.payroll_run_status_for_commission_metadata(metadata)
    )
  )
  WITH CHECK (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('draft', 'previewed', 'submitted', 'approved', 'locked')
  );

CREATE POLICY compensation_commission_entries_update_executive
  ON public.compensation_commission_entries FOR UPDATE TO authenticated
  USING (
    public.compensation_can_approve_tenant(tenant_id)
    AND NOT public.payroll_domain_is_immutable_status(status)
  )
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));

CREATE POLICY compensation_adjustments_update_hr
  ON public.compensation_adjustments FOR UPDATE TO authenticated
  USING (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('draft', 'submitted')
    AND NOT public.payroll_domain_is_immutable_status(
      public.payroll_run_status_for_id(payroll_run_id)
    )
  )
  WITH CHECK (
    public.compensation_role() = 'hr'
    AND public.compensation_can_support_tenant(tenant_id)
    AND status IN ('draft', 'submitted')
  );

CREATE POLICY compensation_adjustments_update_executive
  ON public.compensation_adjustments FOR UPDATE TO authenticated
  USING (public.compensation_can_approve_tenant(tenant_id))
  WITH CHECK (public.compensation_can_approve_tenant(tenant_id));

COMMENT ON FUNCTION public.compensation_agent_line_visible(text, uuid, text) IS
  'Agent own-history visibility for locked/exported/paid payroll lines only.';
COMMENT ON FUNCTION public.enforce_payroll_workflow_rbac() IS
  'Phase 3C.1 guard: HR preview/submit only; Executive owns approve/reject/lock/export/pay transitions.';
