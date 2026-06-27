-- Fix Sprint 1 transaction RPCs: tenant_id columns are uuid; compare with explicit casts.

CREATE OR REPLACE FUNCTION public.post_collection_payment(
  p_tenant_id text,
  p_lab_id text,
  p_payment_id text,
  p_amount_received numeric,
  p_mode text DEFAULT 'Cash',
  p_payment_date date DEFAULT CURRENT_DATE,
  p_order_id text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_collected_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab text;
  v_tid text;
  v_tid_uuid uuid;
  v_pid text;
  v_ar public.ar_credit_control%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_old_out numeric;
  v_old_paid numeric;
  v_new_out numeric;
  v_new_paid numeric;
BEGIN
  v_lab := public.primecare_normalize_lab_id(p_lab_id);
  v_tid := btrim(p_tenant_id);
  v_pid := btrim(p_payment_id);

  IF v_lab IS NULL OR v_tid IS NULL OR v_pid IS NULL THEN
    RAISE EXCEPTION 'payment_args_required';
  END IF;
  IF p_amount_received IS NULL OR p_amount_received <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_tid_uuid := v_tid::uuid;

  IF NOT (
    public.can_write_ops_for_tenant(v_tid_uuid)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(v_tid_uuid, v_lab)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_pay
  FROM public.payments
  WHERE payment_id = v_pid
    AND tenant_id = v_tid_uuid
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'payment', row_to_json(v_pay)
    );
  END IF;

  SELECT * INTO v_ar
  FROM public.ar_credit_control
  WHERE tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(lab_id) = v_lab
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ar_row_not_found';
  END IF;

  v_old_out := COALESCE(v_ar.outstanding, 0);
  v_old_paid := COALESCE(v_ar.total_paid, 0);
  v_new_paid := v_old_paid + p_amount_received;
  v_new_out := GREATEST(0::numeric, v_old_out - p_amount_received);

  INSERT INTO public.payments (
    payment_id,
    tenant_id,
    lab_id,
    amount_received,
    payment_date,
    mode,
    outstanding_balance,
    created_at,
    note,
    collected_by,
    order_id
  )
  VALUES (
    v_pid,
    v_tid_uuid,
    v_lab,
    p_amount_received,
    COALESCE(p_payment_date, CURRENT_DATE),
    COALESCE(nullif(btrim(p_mode), ''), 'Cash'),
    v_new_out,
    now(),
    nullif(btrim(p_note), ''),
    nullif(btrim(p_collected_by), ''),
    nullif(btrim(p_order_id), '')
  )
  RETURNING * INTO v_pay;

  UPDATE public.ar_credit_control
  SET
    total_paid = v_new_paid,
    outstanding = v_new_out,
    updated_at = now()
  WHERE tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(lab_id) = v_lab;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'payment', row_to_json(v_pay),
    'ar', jsonb_build_object(
      'lab_id', v_lab,
      'total_paid', v_new_paid,
      'outstanding', v_new_out
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_inventory_for_order(
  p_tenant_id text,
  p_order_id text,
  p_product_id text,
  p_quantity numeric,
  p_product_name text DEFAULT NULL,
  p_created_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid text;
  v_tid_uuid uuid;
  v_oid text;
  v_pid text;
  v_qty numeric;
  v_row public.inventory%ROWTYPE;
  v_before numeric;
  v_after numeric;
  v_existing_id uuid;
BEGIN
  v_tid := btrim(p_tenant_id);
  v_oid := btrim(p_order_id);
  v_pid := btrim(p_product_id);
  v_qty := COALESCE(p_quantity, 0);

  IF v_tid IS NULL OR v_oid IS NULL OR v_pid IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'inventory_deduction_args_required';
  END IF;

  v_tid_uuid := v_tid::uuid;

  IF NOT public.can_write_ops_for_tenant(v_tid_uuid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.inventory_ledger
  WHERE tenant_id = v_tid_uuid
    AND order_id = v_oid
    AND product_id = v_pid
    AND movement_type = 'ORDER_OUT'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'ledger_id', v_existing_id
    );
  END IF;

  SELECT * INTO v_row
  FROM public.inventory
  WHERE tenant_id = v_tid_uuid
    AND product_id = v_pid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_not_found';
  END IF;

  v_before := COALESCE(v_row.current_stock, 0);
  IF v_qty > v_before THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

  v_after := v_before - v_qty;

  UPDATE public.inventory
  SET current_stock = v_after, updated_at = now()
  WHERE tenant_id = v_tid_uuid
    AND product_id = v_pid
    AND current_stock >= v_qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_stock_race';
  END IF;

  INSERT INTO public.inventory_ledger (
    movement_type,
    product_id,
    product_name,
    order_id,
    quantity,
    stock_before,
    stock_after,
    tenant_id,
    created_by,
    created_at
  )
  VALUES (
    'ORDER_OUT',
    v_pid,
    nullif(btrim(p_product_name), ''),
    v_oid,
    v_qty,
    v_before,
    v_after,
    v_tid_uuid,
    nullif(btrim(p_created_by), ''),
    now()
  )
  RETURNING id INTO v_existing_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'ledger_id', v_existing_id,
    'stock_after', v_after
  );
END;
$$;

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
