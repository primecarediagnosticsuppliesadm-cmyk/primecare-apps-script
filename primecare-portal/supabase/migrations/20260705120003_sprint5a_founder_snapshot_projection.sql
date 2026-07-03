-- Sprint 5A — Founder snapshot reads pre-materialized executive metrics (no live table scans).
CREATE OR REPLACE FUNCTION public.get_founder_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.proj_tenant_executive_metrics_v1%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR NOT public.tenant_id_matches(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_mismatch';
  END IF;

  SELECT * INTO v_row
  FROM public.proj_tenant_executive_metrics_v1 e
  WHERE e.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'as_of', now(),
      'revenue_today', 0,
      'cash_collected_today', 0,
      'outstanding_ar', 0,
      'orders_waiting', 0,
      'orders_delayed', 0,
      'critical_inventory_skus', 0,
      'collections_at_risk', 0,
      'inactive_agents_7d', 0,
      'labs_needing_attention', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'as_of', COALESCE(v_row.refreshed_at, now()),
    'revenue_today', COALESCE(v_row.revenue_today, 0),
    'cash_collected_today', COALESCE(v_row.cash_collected_today, 0),
    'outstanding_ar', COALESCE(v_row.outstanding_ar, 0),
    'orders_waiting', COALESCE(v_row.orders_waiting, 0),
    'orders_delayed', COALESCE(v_row.orders_delayed, 0),
    'critical_inventory_skus', COALESCE(v_row.critical_inventory_skus, 0),
    'collections_at_risk', COALESCE(v_row.collections_at_risk, 0),
    'inactive_agents_7d', COALESCE(v_row.inactive_agents_7d, 0),
    'labs_needing_attention', COALESCE(v_row.labs_needing_attention, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_founder_snapshot IS
  'Founder/executive headline KPIs from proj_tenant_executive_metrics_v1 (Sprint 5A).';
