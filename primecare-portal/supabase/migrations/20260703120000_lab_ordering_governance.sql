-- Phase 4 — Lab ordering governance: ordering_mode on labs + server-side initiation gates.

ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS ordering_mode text NOT NULL DEFAULT 'hq_managed';

ALTER TABLE public.labs
  DROP CONSTRAINT IF EXISTS labs_ordering_mode_check;

ALTER TABLE public.labs
  ADD CONSTRAINT labs_ordering_mode_check
  CHECK (ordering_mode IN ('hq_managed', 'hybrid', 'self_service', 'suspended'));

COMMENT ON COLUMN public.labs.ordering_mode IS
  'Controls who may initiate orders: hq_managed | hybrid | self_service | suspended. Default hq_managed.';

UPDATE public.labs
SET ordering_mode = 'hq_managed'
WHERE ordering_mode IS NULL OR btrim(ordering_mode) = '';

CREATE OR REPLACE FUNCTION public.lab_ordering_allows_lab_initiate(
  p_tenant_id uuid,
  p_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT l.ordering_mode IN ('hybrid', 'self_service')
      FROM public.labs l
      WHERE l.tenant_id = p_tenant_id
        AND public.primecare_normalize_lab_id(l.lab_id) = public.primecare_normalize_lab_id(p_lab_id)
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.lab_ordering_allows_lab_initiate(uuid, text) IS
  'True when lab role may initiate orders (hybrid or self_service). HQ callers bypass via separate RLS branch.';

GRANT EXECUTE ON FUNCTION public.lab_ordering_allows_lab_initiate(uuid, text) TO authenticated;

-- Recreate v_labs_credit to expose ordering_mode (security_invoker unchanged).
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
  END AS credit_status
FROM public.labs l
LEFT JOIN public.ar_credit_control a
  ON l.tenant_id = a.tenant_id
 AND l.lab_id = a.lab_id;

COMMENT ON VIEW public.v_labs_credit IS
  'Labs with credit posture + ordering_mode; security_invoker enforces caller RLS.';

-- Tighten lab order INSERT: ordering mode gate for lab callers.
DROP POLICY IF EXISTS orders_insert_by_role ON public.orders;
CREATE POLICY orders_insert_by_role
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.tenant_id_matches(tenant_id)
      AND public.primecare_normalize_lab_id(lab_id) = public.current_profile_lab_id()
      AND public.lab_ordering_allows_lab_initiate(tenant_id, lab_id)
    )
  );

-- Patch create_lab_order: block lab initiation when ordering_mode disallows.
CREATE OR REPLACE FUNCTION public.create_lab_order(
  p_tenant_id text,
  p_lab_id text,
  p_order_id text,
  p_items jsonb,
  p_client_request_id text DEFAULT NULL,
  p_order_date date DEFAULT CURRENT_DATE,
  p_status text DEFAULT 'Placed',
  p_created_by text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid text;
  v_tid_uuid uuid;
  v_lab text;
  v_oid text;
  v_crid text;
  v_existing public.orders%ROWTYPE;
  v_item jsonb;
  v_line_no int := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit numeric;
  v_line_total numeric;
  v_product_id text;
  v_product_name text;
  v_order_item_id text;
  v_credit_hold boolean;
  v_status text;
BEGIN
  v_tid := btrim(p_tenant_id);
  v_lab := public.primecare_normalize_lab_id(p_lab_id);
  v_oid := btrim(p_order_id);
  v_crid := nullif(btrim(p_client_request_id), '');
  v_status := COALESCE(nullif(btrim(p_status), ''), 'Placed');

  IF v_tid IS NULL OR v_lab IS NULL OR v_oid IS NULL THEN
    RAISE EXCEPTION 'order_args_required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  v_tid_uuid := v_tid::uuid;

  IF NOT (
    public.can_write_ops_for_tenant(v_tid_uuid)
    OR (
      public.current_user_role() = 'lab'
      AND public.primecare_normalize_lab_id(public.current_profile_lab_id()) = v_lab
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.current_user_role() = 'lab'
     AND NOT public.lab_ordering_allows_lab_initiate(v_tid_uuid, v_lab) THEN
    RAISE EXCEPTION 'lab_ordering_blocked';
  END IF;

  IF v_crid IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.orders
    WHERE tenant_id = v_tid_uuid
      AND client_request_id = v_crid
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'order', row_to_json(v_existing)
      );
    END IF;
  END IF;

  SELECT COALESCE(credit_hold, false) INTO v_credit_hold
  FROM public.ar_credit_control
  WHERE tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(lab_id) = v_lab
  LIMIT 1;

  IF v_credit_hold THEN
    RAISE EXCEPTION 'credit_hold_active';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_product_id := btrim(v_item->>'product_id');
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_order_line';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.tenant_id = v_tid_uuid
        AND i.product_id = v_product_id
        AND COALESCE(i.current_stock, 0) >= v_qty
    ) THEN
      RAISE EXCEPTION 'insufficient_inventory';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_line_total := round(v_qty * v_unit, 2);
    v_total := v_total + v_line_total;
  END LOOP;

  INSERT INTO public.orders (
    order_id,
    tenant_id,
    lab_id,
    order_date,
    status,
    total_amount,
    created_by,
    created_at,
    notes,
    client_request_id
  )
  VALUES (
    v_oid,
    v_tid_uuid,
    v_lab,
    COALESCE(p_order_date, CURRENT_DATE),
    v_status,
    v_total,
    nullif(btrim(p_created_by), ''),
    now(),
    nullif(btrim(p_notes), ''),
    v_crid
  )
  RETURNING * INTO v_existing;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_line_no := v_line_no + 1;
    v_product_id := btrim(v_item->>'product_id');
    v_product_name := nullif(btrim(v_item->>'product_name'), '');
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_line_total := round(v_qty * v_unit, 2);
    v_order_item_id := format('OIN-%s-%s-%s', v_oid, v_line_no, extract(epoch from now())::bigint);

    INSERT INTO public.order_items (
      order_item_id,
      order_id,
      tenant_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      created_by,
      created_at
    )
    VALUES (
      v_order_item_id,
      v_oid,
      v_tid_uuid,
      v_product_id,
      v_product_name,
      v_qty,
      v_unit,
      v_line_total,
      nullif(btrim(p_created_by), ''),
      now()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order', row_to_json(v_existing)
  );
EXCEPTION
  WHEN unique_violation THEN
  IF v_crid IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.orders
    WHERE tenant_id = v_tid_uuid
      AND client_request_id = v_crid
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'order', row_to_json(v_existing)
      );
    END IF;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lab_order(text, text, text, jsonb, text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lab_order(text, text, text, jsonb, text, date, text, text, text) TO authenticated;
