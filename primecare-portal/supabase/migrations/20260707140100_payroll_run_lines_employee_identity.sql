-- Phase 7.1 follow-up — profile-first payroll line identity for non-agent employees.

ALTER TABLE public.payroll_run_lines
  ADD COLUMN IF NOT EXISTS employee_name text,
  ADD COLUMN IF NOT EXISTS employee_role text;

-- Backfill only mutable lines; locked/exported/paid rows remain immutable per domain rules.
UPDATE public.payroll_run_lines AS line
SET
  employee_name = COALESCE(line.employee_name, line.agent_name, line.agent_id),
  employee_role = COALESCE(NULLIF(lower(btrim(line.employee_role)), ''), 'agent')
WHERE (line.employee_name IS NULL OR line.employee_role IS NULL)
  AND NOT public.payroll_domain_is_immutable_status(line.line_status)
  AND NOT public.payroll_domain_is_immutable_status(
    public.payroll_run_status_for_id(line.payroll_run_id)
  );
