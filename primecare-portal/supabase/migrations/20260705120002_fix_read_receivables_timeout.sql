-- Simplify receivables read adapter — remove payments scan (statement timeout on QA).
CREATE OR REPLACE FUNCTION public.read_lab_receivables_list_v1(
  p_limit integer DEFAULT 5000,
  p_days_back integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000);
  v_rows jsonb;
  v_as_of timestamptz;
  v_total_outstanding numeric(14, 2) := 0;
  v_overdue_count integer := 0;
  v_high_risk_count integer := 0;
  v_last_payment_map jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(MAX(p.refreshed_at), now()) INTO v_as_of
  FROM public.proj_lab_receivable_v1 p;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.tenant_id,
      p.lab_id,
      p.lab_name,
      p.outstanding_amount AS outstanding,
      p.total_paid,
      p.total_delivered,
      p.credit_limit,
      p.credit_hold,
      p.overdue_days,
      p.risk_status,
      p.payment_status,
      p.assigned_agent,
      p.agent_id,
      p.area,
      p.last_payment_date,
      p.refreshed_at
    FROM public.proj_lab_receivable_v1 p
    WHERE (
      COALESCE(p.outstanding_amount, 0) > 0
      OR COALESCE(p.total_paid, 0) > 0
      OR COALESCE(p.total_delivered, 0) > 0
      OR COALESCE(p.overdue_days, 0) > 0
      OR upper(btrim(COALESCE(p.credit_hold, ''))) IN ('HOLD', 'YES')
      OR lower(btrim(COALESCE(p.risk_status, ''))) IN ('high', 'medium')
    )
    ORDER BY p.outstanding_amount DESC NULLS LAST, p.lab_id
    LIMIT v_limit
  ) t;

  SELECT
    COALESCE(SUM((elem->>'outstanding')::numeric), 0),
    COUNT(*) FILTER (WHERE COALESCE((elem->>'overdue_days')::numeric, 0) > 0),
    COUNT(*) FILTER (WHERE lower(btrim(COALESCE(elem->>'risk_status', ''))) = 'high')
  INTO v_total_outstanding, v_overdue_count, v_high_risk_count
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) elem;

  SELECT COALESCE(
    jsonb_object_agg(elem->>'lab_id', elem->>'last_payment_date'),
    '{}'::jsonb
  )
  INTO v_last_payment_map
  FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) elem
  WHERE elem->>'last_payment_date' IS NOT NULL
    AND btrim(elem->>'last_payment_date') <> '';

  RETURN jsonb_build_object(
    'success', true,
    'readFailed', false,
    'projection', true,
    'registry_id', 'PRJ-COL-LAB-v1',
    'as_of', v_as_of,
    'staleness_ms', GREATEST(0, (EXTRACT(EPOCH FROM (now() - v_as_of)) * 1000)::bigint),
    'data', jsonb_build_object(
      'collections', v_rows,
      'summary', jsonb_build_object(
        'totalOutstanding', v_total_outstanding,
        'overdueCount', v_overdue_count,
        'highRiskCount', v_high_risk_count,
        'todayCollections', 0
      ),
      'lastPaymentByLabId', v_last_payment_map
    )
  );
END;
$$;
