-- PrimeCare Compensation Phase 3C — Payroll domain completion.
-- Domain workflow only: lifecycle, immutability, adjustment/export vocabulary.
-- Does not modify Finance, AR, Orders, Payments, Collections, Inventory,
-- Logistics, projections, legacy commission_entries, accounting, GL, bank, or
-- disbursement tables.

-- ---------------------------------------------------------------------------
-- Lifecycle / enum-like constraint expansion
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_status_check;
ALTER TABLE public.payroll_periods ADD CONSTRAINT payroll_periods_status_check CHECK (
  status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'paid', 'void')
);

ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_status_check CHECK (
  status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'paid', 'void')
);

ALTER TABLE public.payroll_run_lines DROP CONSTRAINT IF EXISTS payroll_run_lines_status_check;
ALTER TABLE public.payroll_run_lines ADD CONSTRAINT payroll_run_lines_status_check CHECK (
  line_status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'paid', 'void')
);

ALTER TABLE public.compensation_commission_entries
  DROP CONSTRAINT IF EXISTS compensation_commission_entries_status_check;
ALTER TABLE public.compensation_commission_entries ADD CONSTRAINT compensation_commission_entries_status_check CHECK (
  status IN ('draft', 'previewed', 'submitted', 'approved', 'locked', 'exported', 'paid', 'void')
);

ALTER TABLE public.compensation_adjustments
  DROP CONSTRAINT IF EXISTS compensation_adjustments_type_check;
ALTER TABLE public.compensation_adjustments ADD CONSTRAINT compensation_adjustments_type_check CHECK (
  adjustment_type IN (
    'positive',
    'negative',
    'recovery',
    'advance',
    'correction',
    'manual_adjustment',
    'penalty'
  )
);

ALTER TABLE public.compensation_approval_events
  DROP CONSTRAINT IF EXISTS compensation_approval_events_action_check;
ALTER TABLE public.compensation_approval_events ADD CONSTRAINT compensation_approval_events_action_check CHECK (
  action IN ('submit', 'approve', 'reject', 'request_changes', 'lock', 'export', 'pay', 'reopen', 'void')
);

ALTER TABLE public.payroll_exports DROP CONSTRAINT IF EXISTS payroll_exports_format_check;
ALTER TABLE public.payroll_exports ADD CONSTRAINT payroll_exports_format_check CHECK (
  export_format IN ('csv', 'excel', 'accounting_ready', 'bank_file', 'pdf_summary')
);

ALTER TABLE public.payroll_exports DROP CONSTRAINT IF EXISTS payroll_exports_status_check;
ALTER TABLE public.payroll_exports ADD CONSTRAINT payroll_exports_status_check CHECK (
  status IN ('generated', 'downloaded', 'void')
);

-- ---------------------------------------------------------------------------
-- Immutable guard helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_domain_is_immutable_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(COALESCE(p_status, '')) IN ('locked', 'exported', 'paid');
$$;

CREATE OR REPLACE FUNCTION public.payroll_run_status_for_id(p_payroll_run_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status
  FROM public.payroll_runs
  WHERE id = p_payroll_run_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.payroll_run_status_for_commission_metadata(p_metadata jsonb)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status
  FROM public.payroll_runs
  WHERE id = CASE
    WHEN COALESCE(p_metadata->>'payroll_run_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (p_metadata->>'payroll_run_id')::uuid
    ELSE NULL
  END
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.payroll_domain_is_immutable_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_run_status_for_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_run_status_for_commission_metadata(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Period/run-level guard: after lock, only locked -> exported -> paid status
-- progress. Reopen must create a new draft run version and leave the source
-- period/run immutable.
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
      RETURN NEW;
    END IF;
    IF OLD.status = 'exported' AND NEW.status = 'paid' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'payroll_period_immutable_after_lock';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_payroll_period_mutation_trigger ON public.payroll_periods;
CREATE TRIGGER prevent_locked_payroll_period_mutation_trigger
  BEFORE UPDATE OR DELETE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_period_mutation();

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
      RETURN NEW;
    END IF;
    IF OLD.status = 'exported' AND NEW.status = 'paid' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'payroll_run_immutable_after_lock';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_payroll_run_mutation_trigger ON public.payroll_runs;
CREATE TRIGGER prevent_locked_payroll_run_mutation_trigger
  BEFORE UPDATE OR DELETE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_run_mutation();

-- ---------------------------------------------------------------------------
-- Detail guards: once a detail row or parent run is locked/exported/paid, no
-- update/delete is allowed.
-- ---------------------------------------------------------------------------
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
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_payroll_line_update_trigger ON public.payroll_run_lines;
CREATE TRIGGER prevent_locked_payroll_line_update_trigger
  BEFORE UPDATE OR DELETE ON public.payroll_run_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_line_mutation();

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
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_commission_entry_update_trigger ON public.compensation_commission_entries;
CREATE TRIGGER prevent_locked_commission_entry_update_trigger
  BEFORE UPDATE OR DELETE ON public.compensation_commission_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_commission_entry_mutation();

CREATE OR REPLACE FUNCTION public.prevent_locked_adjustment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_status text;
BEGIN
  v_parent_status := public.payroll_run_status_for_id(OLD.payroll_run_id);
  IF public.payroll_domain_is_immutable_status(v_parent_status)
    OR OLD.status = 'approved' THEN
    RAISE EXCEPTION 'payroll_adjustment_immutable_after_approval_or_lock';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_adjustment_update_trigger ON public.compensation_adjustments;
CREATE TRIGGER prevent_locked_adjustment_update_trigger
  BEFORE UPDATE OR DELETE ON public.compensation_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_adjustment_mutation();

COMMENT ON FUNCTION public.prevent_locked_payroll_run_mutation() IS
  'Phase 3C guard: locked payroll runs can progress to exported/paid only; reopen creates a new draft version.';
COMMENT ON FUNCTION public.prevent_locked_payroll_line_mutation() IS
  'Phase 3C guard: payroll line details are immutable once line or parent run is locked/exported/paid.';
