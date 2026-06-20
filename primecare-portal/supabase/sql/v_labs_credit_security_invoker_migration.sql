-- P0: Recreate v_labs_credit with security_invoker so RLS on labs/ar_credit_control
-- applies per authenticated caller (PostgreSQL 15+), matching v_lab_catalog pattern.
--
-- Idempotent. Does not change view columns, joins, or seed data.
-- Run after production_auth_rls_pilot_migration.sql.

DROP VIEW IF EXISTS public.v_labs_credit;

CREATE VIEW public.v_labs_credit
WITH (security_invoker = true)
AS
SELECT
  l.tenant_id,
  l.lab_id,
  l.lab_name,
  l.owner_name,
  l.phone,
  l.area,
  l.status,
  l.assigned_agent_id,
  COALESCE(a.outstanding, (0)::numeric) AS outstanding,
  COALESCE(a.credit_limit, (0)::numeric) AS credit_limit,
  COALESCE(a.days_overdue, 0) AS days_overdue,
  COALESCE(a.allowed_overdue_days, 15) AS allowed_overdue_days,
  COALESCE(a.credit_hold, false) AS credit_hold,
  CASE
    WHEN (COALESCE(a.credit_hold, false) = true) THEN 'BLOCKED'::text
    WHEN (
      (COALESCE(a.credit_limit, (0)::numeric) > (0)::numeric)
      AND (COALESCE(a.outstanding, (0)::numeric) >= COALESCE(a.credit_limit, (0)::numeric))
    ) THEN 'LIMIT_REACHED'::text
    WHEN (COALESCE(a.days_overdue, 0) > COALESCE(a.allowed_overdue_days, 15)) THEN 'OVERDUE'::text
    ELSE 'OK'::text
  END AS credit_status
FROM public.labs l
LEFT JOIN public.ar_credit_control a
  ON l.tenant_id = a.tenant_id
 AND l.lab_id = a.lab_id;

COMMENT ON VIEW public.v_labs_credit IS
  'Labs with credit posture; security_invoker enforces caller RLS on underlying labs + ar_credit_control.';
