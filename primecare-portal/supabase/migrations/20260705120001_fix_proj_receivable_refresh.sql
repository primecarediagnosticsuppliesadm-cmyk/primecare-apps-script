-- Fix receivable refresh — ar_credit_control has no agent_name / days_overdue columns.
CREATE OR REPLACE FUNCTION public.refresh_proj_lab_receivable_row_v1(
  p_tenant_id uuid,
  p_lab_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab text;
  v_ar public.ar_credit_control%ROWTYPE;
  v_credit record;
  v_has_ar boolean := false;
  v_has_credit boolean := false;
  v_payments_sum numeric(14, 2) := 0;
  v_last_payment date;
  v_outstanding numeric(14, 2) := 0;
  v_total_paid numeric(14, 2) := 0;
  v_total_delivered numeric(14, 2) := 0;
  v_credit_limit numeric(14, 2) := 0;
  v_overdue numeric(10, 2) := 0;
  v_credit_hold text := '';
  v_lab_name text := '';
  v_agent text := '';
  v_agent_id text := '';
  v_area text := '';
  v_risk text;
  v_payment_status text;
BEGIN
  v_lab := public.primecare_normalize_lab_id(p_lab_id);
  IF p_tenant_id IS NULL OR v_lab IS NULL THEN
    RAISE EXCEPTION 'receivable_refresh_args_required';
  END IF;

  SELECT * INTO v_ar
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(ar.lab_id) = v_lab
  LIMIT 1;

  v_has_ar := FOUND;

  IF to_regclass('public.v_labs_credit') IS NOT NULL THEN
    SELECT
      lc.lab_name,
      lc.outstanding,
      lc.credit_limit,
      lc.credit_hold,
      lc.days_overdue,
      lc.area,
      lc.assigned_agent_id,
      lc.owner_name
    INTO v_credit
    FROM public.v_labs_credit lc
    WHERE lc.tenant_id = p_tenant_id
      AND public.primecare_normalize_lab_id(lc.lab_id) = v_lab
    LIMIT 1;
    v_has_credit := FOUND;
  END IF;

  SELECT
    COALESCE(SUM(p.amount_received), 0),
    MAX(p.payment_date)
  INTO v_payments_sum, v_last_payment
  FROM public.payments p
  WHERE p.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(p.lab_id) = v_lab;

  IF v_has_ar THEN
    v_outstanding := COALESCE(v_ar.outstanding, 0);
    v_total_paid := GREATEST(COALESCE(v_ar.total_paid, 0), COALESCE(v_payments_sum, 0));
    v_total_delivered := COALESCE(v_ar.total_delivered, 0);
    v_credit_limit := COALESCE(v_ar.credit_limit, 0);
    v_overdue := COALESCE(v_credit.days_overdue, 0);
    v_credit_hold := COALESCE(v_ar.credit_hold::text, '');
    v_lab_name := COALESCE(v_ar.lab_name, v_credit.lab_name, v_lab);
    v_agent_id := COALESCE(v_credit.assigned_agent_id::text, '');
    v_agent := COALESCE(v_credit.owner_name, '');
    v_area := COALESCE(v_credit.area, '');
  ELSIF v_has_credit THEN
    v_outstanding := COALESCE(v_credit.outstanding, 0);
    v_total_paid := GREATEST(COALESCE(v_payments_sum, 0), 0);
    v_credit_limit := COALESCE(v_credit.credit_limit, 0);
    v_overdue := COALESCE(v_credit.days_overdue, 0);
    v_credit_hold := COALESCE(v_credit.credit_hold::text, '');
    v_lab_name := COALESCE(v_credit.lab_name, v_lab);
    v_agent_id := COALESCE(v_credit.assigned_agent_id::text, '');
    v_agent := COALESCE(v_credit.owner_name, '');
    v_area := COALESCE(v_credit.area, '');
  ELSE
    DELETE FROM public.proj_lab_receivable_v1
    WHERE tenant_id = p_tenant_id AND lab_id = v_lab;
    RETURN jsonb_build_object('success', true, 'deleted', true, 'lab_id', v_lab);
  END IF;

  v_risk := public._proj_derive_risk_status_v1(v_credit_hold, v_overdue, v_outstanding);
  v_payment_status := public._proj_derive_payment_status_v1(
    v_outstanding, v_total_paid, v_overdue, v_credit_hold
  );

  INSERT INTO public.proj_lab_receivable_v1 (
    tenant_id, lab_id, lab_name, outstanding_amount, total_paid, total_delivered,
    credit_limit, credit_hold, overdue_days, risk_status, payment_status,
    assigned_agent, agent_id, area, last_payment_date, refreshed_at
  )
  VALUES (
    p_tenant_id, v_lab, v_lab_name, v_outstanding, v_total_paid, v_total_delivered,
    v_credit_limit, v_credit_hold, v_overdue, v_risk, v_payment_status,
    v_agent, v_agent_id, v_area, v_last_payment, now()
  )
  ON CONFLICT (tenant_id, lab_id) DO UPDATE
  SET
    lab_name = EXCLUDED.lab_name,
    outstanding_amount = EXCLUDED.outstanding_amount,
    total_paid = EXCLUDED.total_paid,
    total_delivered = EXCLUDED.total_delivered,
    credit_limit = EXCLUDED.credit_limit,
    credit_hold = EXCLUDED.credit_hold,
    overdue_days = EXCLUDED.overdue_days,
    risk_status = EXCLUDED.risk_status,
    payment_status = EXCLUDED.payment_status,
    assigned_agent = EXCLUDED.assigned_agent,
    agent_id = EXCLUDED.agent_id,
    area = EXCLUDED.area,
    last_payment_date = EXCLUDED.last_payment_date,
    refreshed_at = now();

  RETURN jsonb_build_object('success', true, 'lab_id', v_lab);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(
      p_tenant_id, 'PRJ-COL-LAB-v1', NULL, SQLERRM
    );
    RAISE;
END;
$$;

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
  v_today date := CURRENT_DATE;
  v_today_collections numeric(14, 2) := 0;
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

  SELECT COALESCE(SUM(p.amount_received), 0)
  INTO v_today_collections
  FROM public.payments p
  WHERE p.payment_date = v_today;

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
        'todayCollections', v_today_collections
      ),
      'lastPaymentByLabId', v_last_payment_map
    )
  );
END;
$$;
