-- Sprint 2 Phase 1 — Domain projections (Orders + Collections).
-- Blueprint: 18_Domain_Projection_Architecture.md
-- Registry: PRJ-ORD-ORDER-v1, PRJ-COL-LAB-v1

-- ---------------------------------------------------------------------------
-- Metadata
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hq_projection_meta_v1 (
  tenant_id uuid NOT NULL,
  registry_id text NOT NULL,
  as_of timestamptz,
  row_count bigint NOT NULL DEFAULT 0,
  model_version integer NOT NULL DEFAULT 1,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, registry_id)
);

ALTER TABLE public.hq_projection_meta_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hq_projection_meta_select" ON public.hq_projection_meta_v1;
CREATE POLICY "hq_projection_meta_select"
  ON public.hq_projection_meta_v1 FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'executive'
    OR public.tenant_id_matches(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- proj_order_v1 — one row per (tenant_id, order_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proj_order_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  order_id text NOT NULL,
  order_uuid uuid,
  lab_id text NOT NULL DEFAULT '',
  lab_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Placed',
  order_date date,
  created_at timestamptz,
  total_amount numeric(14, 2) NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  invoice_id text,
  invoice_status text,
  payment_status text,
  agent_id text,
  inventory_updated boolean NOT NULL DEFAULT false,
  fulfilled_at timestamptz,
  notes text,
  created_by text,
  model_version integer NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proj_order_v1_tenant_order_uidx UNIQUE (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_order_v1_tenant_date
  ON public.proj_order_v1 (tenant_id, order_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_proj_order_v1_tenant_refreshed
  ON public.proj_order_v1 (tenant_id, refreshed_at DESC);

ALTER TABLE public.proj_order_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj_order_v1_select" ON public.proj_order_v1;
CREATE POLICY "proj_order_v1_select"
  ON public.proj_order_v1 FOR SELECT TO authenticated
  USING (public.distributor_lab_record_visible(tenant_id, lab_id));

-- ---------------------------------------------------------------------------
-- proj_lab_receivable_v1 — one row per (tenant_id, lab_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proj_lab_receivable_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lab_id text NOT NULL,
  lab_name text NOT NULL DEFAULT '',
  outstanding_amount numeric(14, 2) NOT NULL DEFAULT 0,
  total_paid numeric(14, 2) NOT NULL DEFAULT 0,
  total_delivered numeric(14, 2) NOT NULL DEFAULT 0,
  credit_limit numeric(14, 2) NOT NULL DEFAULT 0,
  credit_hold text NOT NULL DEFAULT '',
  overdue_days numeric(10, 2) NOT NULL DEFAULT 0,
  risk_status text NOT NULL DEFAULT 'Low',
  payment_status text NOT NULL DEFAULT 'Outstanding',
  assigned_agent text NOT NULL DEFAULT '',
  agent_id text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  last_follow_up date,
  next_follow_up date,
  next_action text,
  collections_notes text,
  last_payment_date date,
  model_version integer NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proj_lab_receivable_v1_tenant_lab_uidx UNIQUE (tenant_id, lab_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_lab_recv_v1_tenant_outstanding
  ON public.proj_lab_receivable_v1 (tenant_id, outstanding_amount DESC);

CREATE INDEX IF NOT EXISTS idx_proj_lab_recv_v1_tenant_refreshed
  ON public.proj_lab_receivable_v1 (tenant_id, refreshed_at DESC);

ALTER TABLE public.proj_lab_receivable_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj_lab_receivable_v1_select" ON public.proj_lab_receivable_v1;
CREATE POLICY "proj_lab_receivable_v1_select"
  ON public.proj_lab_receivable_v1 FOR SELECT TO authenticated
  USING (public.distributor_lab_record_visible(tenant_id, lab_id));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._proj_touch_meta_v1(
  p_tenant_id uuid,
  p_registry_id text,
  p_row_count bigint,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hq_projection_meta_v1 (
    tenant_id, registry_id, as_of, row_count, model_version, last_error, updated_at
  )
  VALUES (
    p_tenant_id, p_registry_id, now(), COALESCE(p_row_count, 0), 1, p_error, now()
  )
  ON CONFLICT (tenant_id, registry_id) DO UPDATE
  SET
    as_of = EXCLUDED.as_of,
    row_count = EXCLUDED.row_count,
    last_error = EXCLUDED.last_error,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public._proj_order_item_count_v1(
  p_tenant_id uuid,
  p_order_id text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF to_regclass('public.order_lines') IS NOT NULL THEN
    SELECT COALESCE(SUM(COALESCE(ol.quantity, 0)), 0)::integer
    INTO v_count
    FROM public.order_lines ol
    WHERE ol.tenant_id = p_tenant_id
      AND btrim(COALESCE(ol.order_id, '')) = btrim(p_order_id);
    IF v_count > 0 THEN
      RETURN v_count;
    END IF;
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    SELECT COALESCE(SUM(COALESCE(oi.quantity, 0)), 0)::integer
    INTO v_count
    FROM public.order_items oi
    WHERE oi.tenant_id = p_tenant_id
      AND btrim(COALESCE(oi.order_id, '')) = btrim(p_order_id);
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public._proj_derive_payment_status_v1(
  p_outstanding numeric,
  p_total_paid numeric,
  p_overdue_days numeric,
  p_credit_hold text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN upper(btrim(COALESCE(p_credit_hold, ''))) IN ('HOLD', 'YES') THEN 'Credit Hold'
      WHEN COALESCE(p_outstanding, 0) <= 0.009 THEN
        CASE WHEN COALESCE(p_total_paid, 0) > 0.009 THEN 'Paid' ELSE 'Current' END
      WHEN COALESCE(p_overdue_days, 0) > 0 THEN 'Overdue'
      WHEN COALESCE(p_total_paid, 0) > 0.009 THEN 'Partially Paid'
      ELSE 'Outstanding'
    END;
$$;

CREATE OR REPLACE FUNCTION public._proj_derive_risk_status_v1(
  p_credit_hold text,
  p_overdue_days numeric,
  p_outstanding numeric
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN upper(btrim(COALESCE(p_credit_hold, ''))) IN ('HOLD', 'YES') THEN 'High'
      WHEN COALESCE(p_overdue_days, 0) > 0 OR COALESCE(p_outstanding, 0) > 0 THEN 'Medium'
      ELSE 'Low'
    END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_proj_order_row_v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_proj_order_row_v1(
  p_tenant_id uuid,
  p_order_id text
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

-- ---------------------------------------------------------------------------
-- refresh_proj_lab_receivable_row_v1
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- rebuild_projection_v1
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
      PERFORM public.refresh_proj_order_row_v1(p_tenant_id, v_order.business_order_id);
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._proj_touch_meta_v1(p_tenant_id, p_registry_id, v_count, NULL);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', v_count);

  ELSIF p_registry_id = 'PRJ-COL-LAB-v1' THEN
    FOR v_lab IN
      SELECT DISTINCT public.primecare_normalize_lab_id(ar.lab_id) AS lab_id
      FROM public.ar_credit_control ar
      WHERE ar.tenant_id = p_tenant_id
        AND public.primecare_normalize_lab_id(ar.lab_id) IS NOT NULL
    LOOP
      PERFORM public.refresh_proj_lab_receivable_row_v1(p_tenant_id, v_lab.lab_id);
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._proj_touch_meta_v1(p_tenant_id, p_registry_id, v_count, NULL);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', v_count);
  END IF;

  RAISE EXCEPTION 'unsupported_registry_id';
END;
$$;

-- ---------------------------------------------------------------------------
-- read_orders_list_v1 — read adapter (SECURITY INVOKER + RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.read_orders_list_v1(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_days_back integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_days integer := GREATEST(COALESCE(p_days_back, 90), 1);
  v_from date := CURRENT_DATE - v_days;
  v_rows jsonb;
  v_as_of timestamptz;
  v_count integer;
BEGIN
  SELECT COALESCE(MAX(p.refreshed_at), now()) INTO v_as_of
  FROM public.proj_order_v1 p
  WHERE p.order_date IS NULL OR p.order_date >= v_from;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.order_id,
      p.order_uuid AS id,
      p.tenant_id,
      p.lab_id,
      p.lab_name,
      p.status,
      p.order_date,
      p.created_at,
      p.total_amount,
      p.item_count,
      p.invoice_id,
      p.invoice_status,
      p.agent_id,
      p.inventory_updated,
      p.fulfilled_at,
      p.notes,
      p.created_by,
      p.refreshed_at
    FROM public.proj_order_v1 p
    WHERE p.order_date IS NULL OR p.order_date >= v_from
    ORDER BY p.order_date DESC NULLS LAST, p.created_at DESC NULLS LAST
    LIMIT v_limit OFFSET v_offset
  ) t;

  v_count := COALESCE(jsonb_array_length(v_rows), 0);

  RETURN jsonb_build_object(
    'success', true,
    'readFailed', false,
    'projection', true,
    'registry_id', 'PRJ-ORD-ORDER-v1',
    'as_of', v_as_of,
    'staleness_ms', GREATEST(0, (EXTRACT(EPOCH FROM (now() - v_as_of)) * 1000)::bigint),
    'data', jsonb_build_object('orders', v_rows),
    'meta', jsonb_build_object(
      'rawRowCount', v_count,
      'mappedRowCount', v_count,
      'limit', v_limit,
      'offset', v_offset,
      'hasMore', v_count >= v_limit
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- read_lab_receivables_list_v1 — read adapter
-- ---------------------------------------------------------------------------
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
  v_days integer := GREATEST(COALESCE(p_days_back, 90), 1);
  v_from date := CURRENT_DATE - v_days;
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
    jsonb_object_agg(
      elem->>'lab_id',
      elem->>'last_payment_date'
    ),
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

-- Grants
GRANT SELECT ON public.proj_order_v1 TO authenticated;
GRANT SELECT ON public.proj_lab_receivable_v1 TO authenticated;
GRANT SELECT ON public.hq_projection_meta_v1 TO authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_proj_order_row_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_projection_v1(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_orders_list_v1(integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_lab_receivables_list_v1(integer, integer) TO authenticated;
