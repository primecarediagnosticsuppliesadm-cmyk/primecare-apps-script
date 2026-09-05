-- Lab Ordering 1A — server-authoritative create_lab_order.
--
-- Authoritative unit price: public.products.selling_price
-- (same source as v_lab_catalog.unit_selling_price).
-- Client unit_price / tenant_id / lab_id / role / agent_id are not trusted
-- for Lab-initiated orders.
--
-- Inventory: PLACE still validates stock only. Fulfillment deduction is unchanged.
-- HQ/Admin on-behalf still uses p_tenant_id + p_lab_id (can_write_ops_for_tenant).
--
-- QA only. Do not apply to Production from this sprint.

CREATE OR REPLACE FUNCTION public.lab_row_is_active(p_tenant_id uuid, p_lab_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.labs l
    WHERE l.tenant_id = p_tenant_id
      AND public.primecare_normalize_lab_id(l.lab_id) = public.primecare_normalize_lab_id(p_lab_id)
      AND upper(btrim(COALESCE(l.status, ''))) = 'ACTIVE'
  );
$$;

COMMENT ON FUNCTION public.lab_row_is_active(uuid, text) IS
  'True when the lab exists in the tenant and lifecycle status is ACTIVE.';

GRANT EXECUTE ON FUNCTION public.lab_row_is_active(uuid, text) TO authenticated;

DROP POLICY IF EXISTS orders_insert_by_role ON public.orders;
DROP POLICY IF EXISTS "orders_insert_by_role" ON public.orders;
CREATE POLICY orders_insert_by_role
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.tenant_id_matches(tenant_id)
      AND public.primecare_normalize_lab_id(lab_id) = public.current_profile_lab_id()
      AND public.lab_ordering_allows_lab_initiate(tenant_id, lab_id)
      AND public.lab_row_is_active(tenant_id, lab_id)
    )
  );

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
  v_role text;
  v_profile public.profiles%ROWTYPE;
  v_lab_status text;
  v_resolved_product_id text;
  v_product_active boolean;
  v_client_tid uuid;
BEGIN
  v_oid := nullif(btrim(p_order_id), '');
  v_crid := nullif(btrim(p_client_request_id), '');
  v_status := COALESCE(nullif(btrim(p_status), ''), 'Placed');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inactive_profile';
  END IF;
  IF COALESCE(v_profile.active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'inactive_profile';
  END IF;

  v_role := lower(btrim(COALESCE(v_profile.role, '')));

  IF v_role = 'lab' THEN
    v_tid_uuid := v_profile.tenant_id;
    v_lab := public.primecare_normalize_lab_id(v_profile.lab_id);
    IF v_tid_uuid IS NULL OR v_lab IS NULL THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    IF nullif(btrim(p_lab_id), '') IS NOT NULL
       AND public.primecare_normalize_lab_id(p_lab_id) IS DISTINCT FROM v_lab THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    IF nullif(btrim(p_tenant_id), '') IS NOT NULL THEN
      BEGIN
        v_client_tid := btrim(p_tenant_id)::uuid;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'forbidden';
      END;
      IF v_client_tid IS DISTINCT FROM v_tid_uuid THEN
        RAISE EXCEPTION 'forbidden';
      END IF;
    END IF;

    v_tid := v_tid_uuid::text;
  ELSE
    v_tid := nullif(btrim(p_tenant_id), '');
    v_lab := public.primecare_normalize_lab_id(p_lab_id);
    IF v_tid IS NULL OR v_lab IS NULL THEN
      RAISE EXCEPTION 'order_args_required';
    END IF;
    BEGIN
      v_tid_uuid := v_tid::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'order_args_required';
    END;
    IF NOT public.can_write_ops_for_tenant(v_tid_uuid) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'order_args_required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  SELECT l.status INTO v_lab_status
  FROM public.labs l
  WHERE l.tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(l.lab_id) = v_lab
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_role = 'lab' THEN
    IF upper(btrim(COALESCE(v_lab_status, ''))) IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'lab_inactive';
    END IF;
    IF NOT public.lab_ordering_allows_lab_initiate(v_tid_uuid, v_lab) THEN
      RAISE EXCEPTION 'lab_ordering_blocked';
    END IF;
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
    IF v_item IS NULL OR jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'invalid_order_line';
    END IF;

    v_product_id := nullif(btrim(v_item->>'product_id'), '');
    BEGIN
      v_qty := (v_item->>'quantity')::numeric;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'invalid_order_line';
    END;

    IF v_product_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_order_line';
    END IF;

    v_resolved_product_id := NULL;
    v_product_name := NULL;
    v_unit := NULL;
    v_product_active := NULL;

    SELECT
      p.product_id,
      p.product_name,
      COALESCE(p.selling_price, 0),
      (p.active IS TRUE)
    INTO
      v_resolved_product_id,
      v_product_name,
      v_unit,
      v_product_active
    FROM public.products p
    WHERE p.tenant_id = v_tid_uuid
      AND upper(btrim(p.product_id)) = upper(v_product_id)
    LIMIT 1;

    IF NOT FOUND OR v_resolved_product_id IS NULL THEN
      RAISE EXCEPTION 'unknown_product';
    END IF;
    IF v_product_active IS NOT TRUE THEN
      RAISE EXCEPTION 'unorderable_product';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.tenant_id = v_tid_uuid
        AND i.product_id = v_resolved_product_id
        AND COALESCE(i.current_stock, 0) >= v_qty
    ) THEN
      RAISE EXCEPTION 'insufficient_inventory';
    END IF;

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
    v_product_id := nullif(btrim(v_item->>'product_id'), '');
    v_qty := (v_item->>'quantity')::numeric;
    v_resolved_product_id := NULL;
    v_product_name := NULL;
    v_unit := NULL;

    SELECT
      p.product_id,
      p.product_name,
      COALESCE(p.selling_price, 0)
    INTO
      v_resolved_product_id,
      v_product_name,
      v_unit
    FROM public.products p
    WHERE p.tenant_id = v_tid_uuid
      AND upper(btrim(p.product_id)) = upper(v_product_id)
    LIMIT 1;

    IF NOT FOUND OR v_resolved_product_id IS NULL THEN
      RAISE EXCEPTION 'unknown_product';
    END IF;

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
      v_resolved_product_id,
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

COMMENT ON FUNCTION public.create_lab_order(text, text, text, jsonb, text, date, text, text, text) IS
  'Creates a lab order. Lab identity comes from the authenticated profile. Line unit_price is always products.selling_price; client unit_price is ignored. Place validates stock; it does not deduct inventory.';

REVOKE ALL ON FUNCTION public.create_lab_order(text, text, text, jsonb, text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lab_order(text, text, text, jsonb, text, date, text, text, text) TO authenticated;
