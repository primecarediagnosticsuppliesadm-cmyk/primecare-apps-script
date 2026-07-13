-- Fix agent_visits column reference in dashboard metrics refresh.
CREATE OR REPLACE FUNCTION public.refresh_proj_tenant_dashboard_metrics_v1(
  p_tenant_id uuid,
  p_days_back integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ord public.proj_tenant_order_metrics_v1%ROWTYPE;
  v_col public.proj_tenant_receivable_metrics_v1%ROWTYPE;
  v_stock jsonb := '{}'::jsonb;
  v_critical integer := 0;
  v_reorder integer := 0;
  v_healthy integer := 0;
  v_total_skus integer := 0;
  v_near_stockout integer := 0;
  v_visits_count integer := 0;
  v_ord_found boolean := false;
  v_col_found boolean := false;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  SELECT * INTO v_ord
  FROM public.proj_tenant_order_metrics_v1 o
  WHERE o.tenant_id = p_tenant_id;
  v_ord_found := FOUND;

  SELECT * INTO v_col
  FROM public.proj_tenant_receivable_metrics_v1 c
  WHERE c.tenant_id = p_tenant_id;
  v_col_found := FOUND;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE COALESCE(i.current_stock, 0) <= 0)::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(i.current_stock, 0) > 0
        AND COALESCE(i.min_stock, 0) > 0
        AND COALESCE(i.current_stock, 0) < COALESCE(i.min_stock, 0)
    )::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(i.current_stock, 0) > 0
        AND NOT (
          COALESCE(i.min_stock, 0) > 0
          AND COALESCE(i.current_stock, 0) < COALESCE(i.min_stock, 0)
        )
    )::integer
  INTO v_total_skus, v_critical, v_reorder, v_healthy
  FROM public.inventory i
  WHERE i.tenant_id = p_tenant_id;

  v_near_stockout := COALESCE(v_critical, 0) + COALESCE(v_reorder, 0);
  v_stock := jsonb_build_object(
    'totalSkus', COALESCE(v_total_skus, 0),
    'criticalItems', COALESCE(v_critical, 0),
    'reorderItems', COALESCE(v_reorder, 0),
    'healthyItems', COALESCE(v_healthy, 0)
  );

  SELECT COUNT(*)::integer
  INTO v_visits_count
  FROM (
    SELECT 1
    FROM public.agent_visits v
    WHERE v.tenant_id = p_tenant_id
    LIMIT 500
  ) bounded_visits;

  INSERT INTO public.proj_tenant_dashboard_metrics_v1 (
    tenant_id, todays_revenue, outstanding_receivables, labs_at_credit_risk,
    products_near_stockout, top_labs_by_revenue, stock_stats, recent_visits_count,
    total_sold_value, today_collections, orders_row_count, refreshed_at
  )
  VALUES (
    p_tenant_id,
    CASE WHEN v_ord_found THEN COALESCE(v_ord.todays_revenue, 0) ELSE 0 END,
    CASE WHEN v_col_found THEN COALESCE(v_col.total_outstanding, 0) ELSE 0 END,
    CASE WHEN v_col_found THEN COALESCE(v_col.labs_at_credit_risk, 0) ELSE 0 END,
    v_near_stockout,
    CASE WHEN v_ord_found THEN COALESCE(v_ord.top_labs_by_revenue, '[]'::jsonb) ELSE '[]'::jsonb END,
    v_stock,
    COALESCE(v_visits_count, 0),
    CASE WHEN v_ord_found THEN COALESCE(v_ord.total_sold_value_90d, 0) ELSE 0 END,
    CASE WHEN v_col_found THEN COALESCE(v_col.today_collections, 0) ELSE 0 END,
    CASE WHEN v_ord_found THEN COALESCE(v_ord.orders_row_count, 0) ELSE 0 END,
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    todays_revenue = EXCLUDED.todays_revenue,
    outstanding_receivables = EXCLUDED.outstanding_receivables,
    labs_at_credit_risk = EXCLUDED.labs_at_credit_risk,
    products_near_stockout = EXCLUDED.products_near_stockout,
    top_labs_by_revenue = EXCLUDED.top_labs_by_revenue,
    stock_stats = EXCLUDED.stock_stats,
    recent_visits_count = EXCLUDED.recent_visits_count,
    total_sold_value = EXCLUDED.total_sold_value,
    today_collections = EXCLUDED.today_collections,
    orders_row_count = EXCLUDED.orders_row_count,
    refreshed_at = now();

  PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-DSH-METRICS-v1', 1, NULL);
  PERFORM public.refresh_proj_tenant_executive_metrics_v1(p_tenant_id);

  RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-DSH-METRICS-v1', NULL, SQLERRM);
    RAISE;
END;
$$;
