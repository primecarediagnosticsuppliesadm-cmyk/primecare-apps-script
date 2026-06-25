-- Sprint 1 — Founder snapshot (server-side aggregates).
CREATE OR REPLACE FUNCTION public.get_founder_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_revenue_today numeric(12, 2) := 0;
  v_cash_today numeric(12, 2) := 0;
  v_outstanding numeric(12, 2) := 0;
  v_orders_waiting bigint := 0;
  v_orders_delayed bigint := 0;
  v_critical_inventory bigint := 0;
  v_collections_at_risk bigint := 0;
  v_inactive_agents bigint := 0;
  v_labs_needing_attention bigint := 0;
BEGIN
  IF p_tenant_id IS NULL OR NOT public.tenant_id_matches(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_mismatch';
  END IF;

  SELECT COALESCE(SUM(o.total_amount), 0)
  INTO v_revenue_today
  FROM public.orders o
  WHERE o.tenant_id::text = p_tenant_id::text
    AND o.order_date = v_today
    AND lower(btrim(COALESCE(o.status, ''))) = 'fulfilled';

  SELECT COALESCE(SUM(p.amount_received), 0)
  INTO v_cash_today
  FROM public.payments p
  WHERE p.tenant_id::text = p_tenant_id::text
    AND p.payment_date = v_today;

  SELECT COALESCE(SUM(ar.outstanding), 0)
  INTO v_outstanding
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id::text = p_tenant_id::text;

  SELECT COUNT(*)::bigint
  INTO v_orders_waiting
  FROM public.orders o
  WHERE o.tenant_id::text = p_tenant_id::text
    AND lower(btrim(COALESCE(o.status, ''))) IN ('placed', 'processing', 'ordered');

  SELECT COUNT(*)::bigint
  INTO v_orders_delayed
  FROM public.orders o
  WHERE o.tenant_id::text = p_tenant_id::text
    AND lower(btrim(COALESCE(o.status, ''))) IN ('placed', 'processing', 'ordered')
    AND o.order_date < v_today - 2;

  SELECT COUNT(*)::bigint
  INTO v_critical_inventory
  FROM public.inventory i
  WHERE i.tenant_id::text = p_tenant_id::text
    AND COALESCE(i.current_stock, 0) <= COALESCE(i.min_stock, 0);

  SELECT COUNT(*)::bigint
  INTO v_collections_at_risk
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id::text = p_tenant_id::text
    AND (
      ar.credit_hold IS TRUE
      OR COALESCE(ar.outstanding, 0) > COALESCE(ar.credit_limit, 0) * 0.9
    );

  SELECT COUNT(*)::bigint
  INTO v_inactive_agents
  FROM public.profiles pr
  WHERE pr.tenant_id = p_tenant_id
    AND lower(btrim(COALESCE(pr.role, ''))) = 'agent'
    AND pr.active IS TRUE
    AND (
      pr.last_login_at IS NULL
      OR pr.last_login_at < now() - interval '7 days'
    );

  SELECT COUNT(DISTINCT ar.lab_id)::bigint
  INTO v_labs_needing_attention
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id::text = p_tenant_id::text
    AND (
      ar.credit_hold IS TRUE
      OR COALESCE(ar.outstanding, 0) > 0
    );

  RETURN jsonb_build_object(
    'as_of', now(),
    'revenue_today', v_revenue_today,
    'cash_collected_today', v_cash_today,
    'outstanding_ar', v_outstanding,
    'orders_waiting', v_orders_waiting,
    'orders_delayed', v_orders_delayed,
    'critical_inventory_skus', v_critical_inventory,
    'collections_at_risk', v_collections_at_risk,
    'inactive_agents_7d', v_inactive_agents,
    'labs_needing_attention', v_labs_needing_attention
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_founder_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_founder_snapshot(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_founder_snapshot IS
  'Server-side founder/executive headline KPIs for a tenant.';
