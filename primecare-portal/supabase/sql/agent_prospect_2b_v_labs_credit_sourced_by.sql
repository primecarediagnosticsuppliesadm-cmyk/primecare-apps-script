-- Agent Prospect 2B — expose sourced_by_agent_id on v_labs_credit.
--
-- Smallest Agent-list read change: append attribution so the UI can categorize
-- RLS-visible rows. security_invoker unchanged. No Lab/HR/anon policy changes.
-- Does not create AR, ownership, or activation.

CREATE OR REPLACE VIEW public.v_labs_credit
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
  l.ordering_mode,
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
  END AS credit_status,
  l.sourced_by_agent_id
FROM public.labs l
LEFT JOIN public.ar_credit_control a
  ON l.tenant_id = a.tenant_id
 AND l.lab_id = a.lab_id;

COMMENT ON VIEW public.v_labs_credit IS
  'Labs with credit posture + ordering_mode + sourced_by_agent_id; security_invoker enforces caller RLS.';

REVOKE ALL ON TABLE public.v_labs_credit FROM PUBLIC;
REVOKE ALL ON TABLE public.v_labs_credit FROM anon;
GRANT SELECT ON TABLE public.v_labs_credit TO authenticated;

NOTIFY pgrst, 'reload schema';
