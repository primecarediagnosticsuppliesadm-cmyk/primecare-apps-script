-- Sprint 2 Phase 2 — Dashboard & Executive metric projections.
-- Blueprint: 18_Domain_Projection_Architecture.md
-- Registry: PRJ-ORD-METRICS-v1, PRJ-COL-METRICS-v1, PRJ-DSH-METRICS-v1, PRJ-EXE-METRICS-v1

-- ---------------------------------------------------------------------------
-- Domain metrics — orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proj_tenant_order_metrics_v1 (
  tenant_id uuid PRIMARY KEY,
  todays_revenue numeric(14, 2) NOT NULL DEFAULT 0,
  week_revenue numeric(14, 2) NOT NULL DEFAULT 0,
  month_revenue numeric(14, 2) NOT NULL DEFAULT 0,
  ytd_revenue numeric(14, 2) NOT NULL DEFAULT 0,
  todays_orders_count integer NOT NULL DEFAULT 0,
  open_orders_count integer NOT NULL DEFAULT 0,
  fulfilled_orders_count integer NOT NULL DEFAULT 0,
  active_orders_count integer NOT NULL DEFAULT 0,
  orders_waiting integer NOT NULL DEFAULT 0,
  orders_delayed integer NOT NULL DEFAULT 0,
  total_sold_value_90d numeric(14, 2) NOT NULL DEFAULT 0,
  orders_row_count integer NOT NULL DEFAULT 0,
  top_labs_by_revenue jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version integer NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proj_tenant_order_metrics_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj_tenant_order_metrics_v1_select" ON public.proj_tenant_order_metrics_v1;
CREATE POLICY "proj_tenant_order_metrics_v1_select"
  ON public.proj_tenant_order_metrics_v1 FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'executive'
    OR public.tenant_id_matches(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Domain metrics — receivables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proj_tenant_receivable_metrics_v1 (
  tenant_id uuid PRIMARY KEY,
  total_outstanding numeric(14, 2) NOT NULL DEFAULT 0,
  today_collections numeric(14, 2) NOT NULL DEFAULT 0,
  overdue_amount numeric(14, 2) NOT NULL DEFAULT 0,
  overdue_count integer NOT NULL DEFAULT 0,
  high_risk_count integer NOT NULL DEFAULT 0,
  at_risk_labs_count integer NOT NULL DEFAULT 0,
  labs_at_credit_risk integer NOT NULL DEFAULT 0,
  collections_at_risk integer NOT NULL DEFAULT 0,
  labs_needing_attention integer NOT NULL DEFAULT 0,
  model_version integer NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proj_tenant_receivable_metrics_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj_tenant_receivable_metrics_v1_select" ON public.proj_tenant_receivable_metrics_v1;
CREATE POLICY "proj_tenant_receivable_metrics_v1_select"
  ON public.proj_tenant_receivable_metrics_v1 FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'executive'
    OR public.tenant_id_matches(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Composite — dashboard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proj_tenant_dashboard_metrics_v1 (
  tenant_id uuid PRIMARY KEY,
  todays_revenue numeric(14, 2) NOT NULL DEFAULT 0,
  outstanding_receivables numeric(14, 2) NOT NULL DEFAULT 0,
  labs_at_credit_risk integer NOT NULL DEFAULT 0,
  products_near_stockout integer NOT NULL DEFAULT 0,
  top_labs_by_revenue jsonb NOT NULL DEFAULT '[]'::jsonb,
  stock_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  recent_visits_count integer NOT NULL DEFAULT 0,
  total_sold_value numeric(14, 2) NOT NULL DEFAULT 0,
  today_collections numeric(14, 2) NOT NULL DEFAULT 0,
  orders_row_count integer NOT NULL DEFAULT 0,
  model_version integer NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proj_tenant_dashboard_metrics_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj_tenant_dashboard_metrics_v1_select" ON public.proj_tenant_dashboard_metrics_v1;
CREATE POLICY "proj_tenant_dashboard_metrics_v1_select"
  ON public.proj_tenant_dashboard_metrics_v1 FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'executive'
    OR public.tenant_id_matches(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Composite — executive
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proj_tenant_executive_metrics_v1 (
  tenant_id uuid PRIMARY KEY,
  revenue_today numeric(14, 2) NOT NULL DEFAULT 0,
  cash_collected_today numeric(14, 2) NOT NULL DEFAULT 0,
  outstanding_ar numeric(14, 2) NOT NULL DEFAULT 0,
  orders_waiting integer NOT NULL DEFAULT 0,
  orders_delayed integer NOT NULL DEFAULT 0,
  critical_inventory_skus integer NOT NULL DEFAULT 0,
  collections_at_risk integer NOT NULL DEFAULT 0,
  inactive_agents_7d integer NOT NULL DEFAULT 0,
  labs_needing_attention integer NOT NULL DEFAULT 0,
  model_version integer NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proj_tenant_executive_metrics_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj_tenant_executive_metrics_v1_select" ON public.proj_tenant_executive_metrics_v1;
CREATE POLICY "proj_tenant_executive_metrics_v1_select"
  ON public.proj_tenant_executive_metrics_v1 FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'executive'
    OR public.tenant_id_matches(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._proj_is_ar_credit_risk_v1(
  p_credit_hold text,
  p_risk_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    upper(btrim(COALESCE(p_credit_hold, ''))) IN ('HOLD', 'YES', 'TRUE')
    OR lower(btrim(COALESCE(p_risk_status, ''))) LIKE '%high%'
    OR lower(btrim(COALESCE(p_risk_status, ''))) LIKE '%hold%'
    OR lower(btrim(COALESCE(p_risk_status, ''))) LIKE '%risk%';
$$;

CREATE OR REPLACE FUNCTION public._proj_assert_tenant_access_v1(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;
  IF NOT (
    public.current_user_role() = 'executive'
    OR public.tenant_id_matches(p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_proj_tenant_order_metrics_v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_proj_tenant_order_metrics_v1(
  p_tenant_id uuid,
  p_days_back integer DEFAULT 90,
  p_cascade_composite boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days_back, 90), 1);
  v_from date := CURRENT_DATE - v_days;
  v_today date := CURRENT_DATE;
  v_week_start date := date_trunc('week', v_today::timestamp)::date;
  v_month_start date := date_trunc('month', v_today::timestamp)::date;
  v_year_start date := date_trunc('year', v_today::timestamp)::date;
  v_todays_revenue numeric(14, 2) := 0;
  v_week_revenue numeric(14, 2) := 0;
  v_month_revenue numeric(14, 2) := 0;
  v_ytd_revenue numeric(14, 2) := 0;
  v_total_sold numeric(14, 2) := 0;
  v_todays_orders integer := 0;
  v_open_orders integer := 0;
  v_fulfilled integer := 0;
  v_active integer := 0;
  v_waiting integer := 0;
  v_delayed integer := 0;
  v_row_count integer := 0;
  v_top_labs jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  SELECT
    COALESCE(SUM(p.total_amount) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
        AND p.order_date = v_today
    ), 0),
    COALESCE(SUM(p.total_amount) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
        AND p.order_date >= v_week_start
    ), 0),
    COALESCE(SUM(p.total_amount) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
        AND p.order_date >= v_month_start
    ), 0),
    COALESCE(SUM(p.total_amount) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
        AND p.order_date >= v_year_start
    ), 0),
    COALESCE(SUM(p.total_amount) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
    ), 0),
    COUNT(*) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
        AND p.order_date = v_today
    )::integer,
    COUNT(*) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) NOT IN ('cancelled', 'fulfilled')
    )::integer,
    COUNT(*) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
    )::integer,
    COUNT(*) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) <> 'cancelled'
    )::integer,
    COUNT(*) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) IN ('placed', 'processing', 'ordered')
    )::integer,
    COUNT(*) FILTER (
      WHERE lower(btrim(COALESCE(p.status, ''))) IN ('placed', 'processing', 'ordered')
        AND p.order_date < v_today - 2
    )::integer,
    COUNT(*)::integer
  INTO
    v_todays_revenue,
    v_week_revenue,
    v_month_revenue,
    v_ytd_revenue,
    v_total_sold,
    v_todays_orders,
    v_open_orders,
    v_fulfilled,
    v_active,
    v_waiting,
    v_delayed,
    v_row_count
  FROM public.proj_order_v1 p
  WHERE p.tenant_id = p_tenant_id
    AND (
      p.order_date IS NULL
      OR p.order_date >= v_from
      OR p.created_at >= v_from::timestamptz
    );

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_labs
  FROM (
    SELECT
      public.primecare_normalize_lab_id(p.lab_id) AS "labId",
      COALESCE(NULLIF(btrim(p.lab_name), ''), public.primecare_normalize_lab_id(p.lab_id)) AS "labName",
      COALESCE(SUM(p.total_amount), 0)::numeric(14, 2) AS revenue
    FROM public.proj_order_v1 p
    WHERE p.tenant_id = p_tenant_id
      AND lower(btrim(COALESCE(p.status, ''))) = 'fulfilled'
      AND (
        p.order_date IS NULL
        OR p.order_date >= v_from
        OR p.created_at >= v_from::timestamptz
      )
      AND public.primecare_normalize_lab_id(p.lab_id) IS NOT NULL
    GROUP BY public.primecare_normalize_lab_id(p.lab_id), p.lab_name
    ORDER BY revenue DESC
    LIMIT 5
  ) t;

  INSERT INTO public.proj_tenant_order_metrics_v1 (
    tenant_id, todays_revenue, week_revenue, month_revenue, ytd_revenue,
    todays_orders_count, open_orders_count, fulfilled_orders_count, active_orders_count,
    orders_waiting, orders_delayed, total_sold_value_90d, orders_row_count,
    top_labs_by_revenue, refreshed_at
  )
  VALUES (
    p_tenant_id, v_todays_revenue, v_week_revenue, v_month_revenue, v_ytd_revenue,
    v_todays_orders, v_open_orders, v_fulfilled, v_active,
    v_waiting, v_delayed, v_total_sold, v_row_count,
    COALESCE(v_top_labs, '[]'::jsonb), now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    todays_revenue = EXCLUDED.todays_revenue,
    week_revenue = EXCLUDED.week_revenue,
    month_revenue = EXCLUDED.month_revenue,
    ytd_revenue = EXCLUDED.ytd_revenue,
    todays_orders_count = EXCLUDED.todays_orders_count,
    open_orders_count = EXCLUDED.open_orders_count,
    fulfilled_orders_count = EXCLUDED.fulfilled_orders_count,
    active_orders_count = EXCLUDED.active_orders_count,
    orders_waiting = EXCLUDED.orders_waiting,
    orders_delayed = EXCLUDED.orders_delayed,
    total_sold_value_90d = EXCLUDED.total_sold_value_90d,
    orders_row_count = EXCLUDED.orders_row_count,
    top_labs_by_revenue = EXCLUDED.top_labs_by_revenue,
    refreshed_at = now();

  PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-ORD-METRICS-v1', 1, NULL);
  IF p_cascade_composite THEN
    PERFORM public.refresh_proj_tenant_dashboard_metrics_v1(p_tenant_id, p_days_back);
  END IF;

  RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-ORD-METRICS-v1', NULL, SQLERRM);
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_proj_tenant_receivable_metrics_v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_proj_tenant_receivable_metrics_v1(
  p_tenant_id uuid,
  p_days_back integer DEFAULT 90,
  p_cascade_composite boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_total_outstanding numeric(14, 2) := 0;
  v_today_collections numeric(14, 2) := 0;
  v_overdue_amount numeric(14, 2) := 0;
  v_overdue_count integer := 0;
  v_high_risk_count integer := 0;
  v_at_risk_labs integer := 0;
  v_labs_credit_risk integer := 0;
  v_collections_at_risk bigint := 0;
  v_labs_attention bigint := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  SELECT
    COALESCE(SUM(p.outstanding_amount), 0),
    COALESCE(SUM(p.outstanding_amount) FILTER (WHERE COALESCE(p.overdue_days, 0) > 0), 0),
    COUNT(*) FILTER (WHERE COALESCE(p.overdue_days, 0) > 0)::integer,
    COUNT(*) FILTER (WHERE lower(btrim(COALESCE(p.risk_status, ''))) = 'high')::integer,
    COUNT(*) FILTER (WHERE public._proj_is_ar_credit_risk_v1(p.credit_hold, p.risk_status))::integer
  INTO
    v_total_outstanding,
    v_overdue_amount,
    v_overdue_count,
    v_high_risk_count,
    v_labs_credit_risk
  FROM public.proj_lab_receivable_v1 p
  WHERE p.tenant_id = p_tenant_id;

  v_at_risk_labs := v_labs_credit_risk;

  SELECT COALESCE(SUM(pay.amount_received), 0)
  INTO v_today_collections
  FROM public.payments pay
  WHERE pay.tenant_id = p_tenant_id
    AND pay.payment_date = v_today;

  SELECT COUNT(*)::bigint
  INTO v_collections_at_risk
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id = p_tenant_id
    AND (
      ar.credit_hold IS TRUE
      OR COALESCE(ar.outstanding, 0) > COALESCE(ar.credit_limit, 0) * 0.9
    );

  SELECT COUNT(DISTINCT ar.lab_id)::bigint
  INTO v_labs_attention
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id = p_tenant_id
    AND (
      ar.credit_hold IS TRUE
      OR COALESCE(ar.outstanding, 0) > 0
    );

  INSERT INTO public.proj_tenant_receivable_metrics_v1 (
    tenant_id, total_outstanding, today_collections, overdue_amount, overdue_count,
    high_risk_count, at_risk_labs_count, labs_at_credit_risk,
    collections_at_risk, labs_needing_attention, refreshed_at
  )
  VALUES (
    p_tenant_id, v_total_outstanding, v_today_collections, v_overdue_amount, v_overdue_count,
    v_high_risk_count, v_at_risk_labs, v_labs_credit_risk,
    v_collections_at_risk, v_labs_attention, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    total_outstanding = EXCLUDED.total_outstanding,
    today_collections = EXCLUDED.today_collections,
    overdue_amount = EXCLUDED.overdue_amount,
    overdue_count = EXCLUDED.overdue_count,
    high_risk_count = EXCLUDED.high_risk_count,
    at_risk_labs_count = EXCLUDED.at_risk_labs_count,
    labs_at_credit_risk = EXCLUDED.labs_at_credit_risk,
    collections_at_risk = EXCLUDED.collections_at_risk,
    labs_needing_attention = EXCLUDED.labs_needing_attention,
    refreshed_at = now();

  PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-COL-METRICS-v1', 1, NULL);
  IF p_cascade_composite THEN
    PERFORM public.refresh_proj_tenant_dashboard_metrics_v1(p_tenant_id, p_days_back);
  END IF;

  RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-COL-METRICS-v1', NULL, SQLERRM);
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_proj_tenant_dashboard_metrics_v1
-- ---------------------------------------------------------------------------
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
  v_days integer := GREATEST(COALESCE(p_days_back, 90), 1);
  v_from date := CURRENT_DATE - v_days;
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

-- ---------------------------------------------------------------------------
-- refresh_proj_tenant_executive_metrics_v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_proj_tenant_executive_metrics_v1(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dsh public.proj_tenant_dashboard_metrics_v1%ROWTYPE;
  v_ord public.proj_tenant_order_metrics_v1%ROWTYPE;
  v_col public.proj_tenant_receivable_metrics_v1%ROWTYPE;
  v_critical_inventory bigint := 0;
  v_inactive_agents bigint := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  SELECT * INTO v_dsh
  FROM public.proj_tenant_dashboard_metrics_v1 d
  WHERE d.tenant_id = p_tenant_id;

  SELECT * INTO v_ord
  FROM public.proj_tenant_order_metrics_v1 o
  WHERE o.tenant_id = p_tenant_id;

  SELECT * INTO v_col
  FROM public.proj_tenant_receivable_metrics_v1 c
  WHERE c.tenant_id = p_tenant_id;

  SELECT COUNT(*)::bigint
  INTO v_critical_inventory
  FROM public.inventory i
  WHERE i.tenant_id = p_tenant_id
    AND COALESCE(i.current_stock, 0) <= COALESCE(i.min_stock, 0);

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

  INSERT INTO public.proj_tenant_executive_metrics_v1 (
    tenant_id, revenue_today, cash_collected_today, outstanding_ar,
    orders_waiting, orders_delayed, critical_inventory_skus,
    collections_at_risk, inactive_agents_7d, labs_needing_attention, refreshed_at
  )
  VALUES (
    p_tenant_id,
    COALESCE(v_dsh.todays_revenue, v_ord.todays_revenue, 0),
    COALESCE(v_dsh.today_collections, v_col.today_collections, 0),
    COALESCE(v_dsh.outstanding_receivables, v_col.total_outstanding, 0),
    COALESCE(v_ord.orders_waiting, 0),
    COALESCE(v_ord.orders_delayed, 0),
    v_critical_inventory,
    COALESCE(v_col.collections_at_risk, 0),
    v_inactive_agents,
    COALESCE(v_col.labs_needing_attention, 0),
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    revenue_today = EXCLUDED.revenue_today,
    cash_collected_today = EXCLUDED.cash_collected_today,
    outstanding_ar = EXCLUDED.outstanding_ar,
    orders_waiting = EXCLUDED.orders_waiting,
    orders_delayed = EXCLUDED.orders_delayed,
    critical_inventory_skus = EXCLUDED.critical_inventory_skus,
    collections_at_risk = EXCLUDED.collections_at_risk,
    inactive_agents_7d = EXCLUDED.inactive_agents_7d,
    labs_needing_attention = EXCLUDED.labs_needing_attention,
    refreshed_at = now();

  PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-EXE-METRICS-v1', 1, NULL);

  RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(p_tenant_id, 'PRJ-EXE-METRICS-v1', NULL, SQLERRM);
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Extend row refresh — optional metrics cascade
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_proj_order_row_v1(
  p_tenant_id uuid,
  p_order_id text,
  p_cascade_metrics boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_lab_name text := '';
  v_item_count integer := 0;
  v_invoice_status text := '';
  v_order_id text;
  v_result jsonb;
BEGIN
  v_order_id := btrim(COALESCE(p_order_id, ''));
  IF p_tenant_id IS NULL OR v_order_id = '' THEN
    RAISE EXCEPTION 'order_refresh_args_required';
  END IF;

  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.tenant_id = p_tenant_id
    AND (
      btrim(COALESCE(o.order_id, '')) = v_order_id
      OR o.id::text = v_order_id
    )
  ORDER BY o.created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    DELETE FROM public.proj_order_v1
    WHERE tenant_id = p_tenant_id
      AND order_id = v_order_id;
    IF p_cascade_metrics THEN
      PERFORM public.refresh_proj_tenant_order_metrics_v1(p_tenant_id);
    END IF;
    RETURN jsonb_build_object('success', true, 'deleted', true, 'order_id', v_order_id);
  END IF;

  v_order_id := btrim(COALESCE(v_order.order_id, v_order.id::text));

  SELECT COALESCE(l.lab_name, '')
  INTO v_lab_name
  FROM public.labs l
  WHERE l.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(l.lab_id) = public.primecare_normalize_lab_id(v_order.lab_id)
  LIMIT 1;

  v_item_count := public._proj_order_item_count_v1(p_tenant_id, v_order_id);

  IF v_order.invoice_id IS NOT NULL AND btrim(v_order.invoice_id::text) <> '' THEN
    SELECT COALESCE(i.status, '')
    INTO v_invoice_status
    FROM public.invoices i
    WHERE i.id::text = v_order.invoice_id::text
       OR i.invoice_number = v_order.invoice_id::text
    LIMIT 1;
  END IF;

  INSERT INTO public.proj_order_v1 (
    tenant_id, order_id, order_uuid, lab_id, lab_name, status, order_date,
    created_at, total_amount, item_count, invoice_id, invoice_status, agent_id,
    inventory_updated, fulfilled_at, notes, created_by, refreshed_at
  )
  VALUES (
    p_tenant_id,
    v_order_id,
    v_order.id,
    COALESCE(v_order.lab_id, ''),
    v_lab_name,
    COALESCE(v_order.status, 'Placed'),
    v_order.order_date,
    v_order.created_at,
    COALESCE(v_order.total_amount, 0),
    v_item_count,
    NULLIF(btrim(COALESCE(v_order.invoice_id::text, '')), ''),
    NULLIF(v_invoice_status, ''),
    NULLIF(btrim(COALESCE(v_order.agent_id::text, '')), ''),
    COALESCE(v_order.inventory_updated, false),
    v_order.fulfilled_at,
    v_order.notes,
    v_order.created_by,
    now()
  )
  ON CONFLICT (tenant_id, order_id) DO UPDATE
  SET
    order_uuid = EXCLUDED.order_uuid,
    lab_id = EXCLUDED.lab_id,
    lab_name = EXCLUDED.lab_name,
    status = EXCLUDED.status,
    order_date = EXCLUDED.order_date,
    created_at = EXCLUDED.created_at,
    total_amount = EXCLUDED.total_amount,
    item_count = EXCLUDED.item_count,
    invoice_id = EXCLUDED.invoice_id,
    invoice_status = EXCLUDED.invoice_status,
    agent_id = EXCLUDED.agent_id,
    inventory_updated = EXCLUDED.inventory_updated,
    fulfilled_at = EXCLUDED.fulfilled_at,
    notes = EXCLUDED.notes,
    created_by = EXCLUDED.created_by,
    refreshed_at = now();

  IF p_cascade_metrics THEN
    PERFORM public.refresh_proj_tenant_order_metrics_v1(p_tenant_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'item_count', v_item_count
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(
      p_tenant_id, 'PRJ-ORD-ORDER-v1', NULL, SQLERRM
    );
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_proj_lab_receivable_row_v1(
  p_tenant_id uuid,
  p_lab_id text,
  p_cascade_metrics boolean DEFAULT true
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
    IF p_cascade_metrics THEN
      PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id);
    END IF;
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

  IF p_cascade_metrics THEN
    PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'lab_id', v_lab);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(
      p_tenant_id, 'PRJ-COL-LAB-v1', NULL, SQLERRM
    );
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- rebuild_projection_v1 — extended cascade
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_projection_v1(
  p_tenant_id uuid,
  p_registry_id text,
  p_days_back integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days_back, 90), 1);
  v_from date := CURRENT_DATE - v_days;
  v_count bigint := 0;
  v_order record;
  v_lab record;
BEGIN
  IF p_tenant_id IS NULL OR btrim(COALESCE(p_registry_id, '')) = '' THEN
    RAISE EXCEPTION 'rebuild_args_required';
  END IF;

  IF NOT (
    public.current_user_role() = 'executive'
    OR public.tenant_id_matches(p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_registry_id = 'PRJ-ORD-ORDER-v1' THEN
    FOR v_order IN
      SELECT DISTINCT ON (btrim(COALESCE(o.order_id, o.id::text)))
        btrim(COALESCE(o.order_id, o.id::text)) AS business_order_id
      FROM public.orders o
      WHERE o.tenant_id = p_tenant_id
        AND (
          o.order_date IS NULL
          OR o.order_date >= v_from
          OR o.created_at >= v_from::timestamptz
        )
      ORDER BY btrim(COALESCE(o.order_id, o.id::text)), o.created_at DESC NULLS LAST
    LOOP
      PERFORM public.refresh_proj_order_row_v1(p_tenant_id, v_order.business_order_id, false);
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._proj_touch_meta_v1(p_tenant_id, p_registry_id, v_count, NULL);
    PERFORM public.refresh_proj_tenant_order_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', v_count);

  ELSIF p_registry_id = 'PRJ-COL-LAB-v1' THEN
    FOR v_lab IN
      SELECT DISTINCT public.primecare_normalize_lab_id(ar.lab_id) AS lab_id
      FROM public.ar_credit_control ar
      WHERE ar.tenant_id = p_tenant_id
        AND public.primecare_normalize_lab_id(ar.lab_id) IS NOT NULL
    LOOP
      PERFORM public.refresh_proj_lab_receivable_row_v1(p_tenant_id, v_lab.lab_id, false);
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._proj_touch_meta_v1(p_tenant_id, p_registry_id, v_count, NULL);
    PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', v_count);

  ELSIF p_registry_id = 'PRJ-ORD-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_order_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);

  ELSIF p_registry_id = 'PRJ-COL-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);

  ELSIF p_registry_id = 'PRJ-DSH-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_dashboard_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);

  ELSIF p_registry_id = 'PRJ-EXE-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_executive_metrics_v1(p_tenant_id);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);
  END IF;

  RAISE EXCEPTION 'unsupported_registry_id';
END;
$$;

-- ---------------------------------------------------------------------------
-- read_tenant_dashboard_v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.read_tenant_dashboard_v1(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.proj_tenant_dashboard_metrics_v1%ROWTYPE;
  v_as_of timestamptz;
BEGIN
  PERFORM public._proj_assert_tenant_access_v1(p_tenant_id);

  SELECT * INTO v_row
  FROM public.proj_tenant_dashboard_metrics_v1 d
  WHERE d.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'readFailed', true,
      'projection', true,
      'registry_id', 'PRJ-DSH-METRICS-v1',
      'error', 'dashboard_metrics_not_materialized',
      'data', NULL
    );
  END IF;

  v_as_of := COALESCE(v_row.refreshed_at, now());

  RETURN jsonb_build_object(
    'success', true,
    'readFailed', false,
    'projection', true,
    'registry_id', 'PRJ-DSH-METRICS-v1',
    'as_of', v_as_of,
    'staleness_ms', GREATEST(0, (EXTRACT(EPOCH FROM (now() - v_as_of)) * 1000)::bigint),
    'data', jsonb_build_object(
      'executive', jsonb_build_object(
        'todaysRevenue', COALESCE(v_row.todays_revenue, 0),
        'outstandingReceivables', COALESCE(v_row.outstanding_receivables, 0),
        'labsAtCreditRisk', COALESCE(v_row.labs_at_credit_risk, 0),
        'productsNearStockout', COALESCE(v_row.products_near_stockout, 0),
        'topLabsByRevenue', COALESCE(v_row.top_labs_by_revenue, '[]'::jsonb)
      ),
      'summary', jsonb_build_object(
        'stockStats', COALESCE(v_row.stock_stats, '{}'::jsonb),
        'recentVisits', COALESCE(v_row.recent_visits_count, 0),
        'totalSoldValue', COALESCE(v_row.total_sold_value, 0),
        'todayCollections', COALESCE(v_row.today_collections, 0),
        'ordersRowCount', COALESCE(v_row.orders_row_count, 0)
      ),
      'visits', jsonb_build_object('visits', '[]'::jsonb),
      'insights', jsonb_build_object('insights', '[]'::jsonb, 'recommendedActions', '[]'::jsonb)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- read_tenant_executive_v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.read_tenant_executive_v1(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.proj_tenant_executive_metrics_v1%ROWTYPE;
  v_as_of timestamptz;
BEGIN
  PERFORM public._proj_assert_tenant_access_v1(p_tenant_id);

  SELECT * INTO v_row
  FROM public.proj_tenant_executive_metrics_v1 e
  WHERE e.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'readFailed', true,
      'projection', true,
      'registry_id', 'PRJ-EXE-METRICS-v1',
      'error', 'executive_metrics_not_materialized',
      'data', NULL
    );
  END IF;

  v_as_of := COALESCE(v_row.refreshed_at, now());

  RETURN jsonb_build_object(
    'success', true,
    'readFailed', false,
    'projection', true,
    'registry_id', 'PRJ-EXE-METRICS-v1',
    'as_of', v_as_of,
    'staleness_ms', GREATEST(0, (EXTRACT(EPOCH FROM (now() - v_as_of)) * 1000)::bigint),
    'data', jsonb_build_object(
      'as_of', v_as_of,
      'revenue_today', COALESCE(v_row.revenue_today, 0),
      'cash_collected_today', COALESCE(v_row.cash_collected_today, 0),
      'outstanding_ar', COALESCE(v_row.outstanding_ar, 0),
      'orders_waiting', COALESCE(v_row.orders_waiting, 0),
      'orders_delayed', COALESCE(v_row.orders_delayed, 0),
      'critical_inventory_skus', COALESCE(v_row.critical_inventory_skus, 0),
      'collections_at_risk', COALESCE(v_row.collections_at_risk, 0),
      'inactive_agents_7d', COALESCE(v_row.inactive_agents_7d, 0),
      'labs_needing_attention', COALESCE(v_row.labs_needing_attention, 0)
    )
  );
END;
$$;

-- Grants
GRANT SELECT ON public.proj_tenant_order_metrics_v1 TO authenticated;
GRANT SELECT ON public.proj_tenant_receivable_metrics_v1 TO authenticated;
GRANT SELECT ON public.proj_tenant_dashboard_metrics_v1 TO authenticated;
GRANT SELECT ON public.proj_tenant_executive_metrics_v1 TO authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_order_metrics_v1(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_receivable_metrics_v1(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_dashboard_metrics_v1(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_tenant_executive_metrics_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_tenant_dashboard_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_tenant_executive_v1(uuid) TO authenticated;
