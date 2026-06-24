-- PrimeCare Invoice System — Phase 2: automatic invoice creation on fulfillment.
-- Run after invoice_system_phase1_migration.sql. Idempotent.
-- Does NOT generate PDFs, allocate payments, or modify AR/collections logic.

-- ---------------------------------------------------------------------------
-- Line item snapshot: optional SKU column (product_id remains canonical)
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS sku text;

COMMENT ON COLUMN public.invoice_line_items.sku IS
  'Immutable SKU snapshot at invoice time; defaults to product_id when absent on order line.';

-- ---------------------------------------------------------------------------
-- Year-scoped invoice number allocation (INV-YYYY-NNNNNN)
-- Uses invoice_number_sequences with seq_date = Jan 1 of invoice year.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer;
  v_bucket date;
  v_seq integer;
  v_number text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_bucket := make_date(v_year, 1, 1);

  SELECT s.last_seq
  INTO v_seq
  FROM public.invoice_number_sequences s
  WHERE s.tenant_id = p_tenant_id
    AND s.seq_date = v_bucket
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.invoice_number_sequences (tenant_id, seq_date, last_seq)
    VALUES (p_tenant_id, v_bucket, 1)
    RETURNING last_seq INTO v_seq;
  ELSE
    UPDATE public.invoice_number_sequences
    SET last_seq = last_seq + 1
    WHERE tenant_id = p_tenant_id
      AND seq_date = v_bucket
    RETURNING last_seq INTO v_seq;
  END IF;

  v_number := 'INV-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_invoice_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- create_invoice_for_fulfilled_order — production implementation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_for_fulfilled_order(
  p_tenant_id uuid,
  p_order_id text,
  p_actor_id text DEFAULT NULL,
  p_created_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing_invoice_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_lab_id text;
  v_lab_name text;
  v_payment_terms integer;
  v_subtotal numeric(12, 2) := 0;
  v_tax_total numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_line record;
  v_line_no smallint := 0;
  v_line_total numeric(12, 2);
  v_tax_amount numeric(12, 2);
  v_status_norm text;
BEGIN
  IF p_tenant_id IS NULL OR nullif(btrim(p_order_id), '') IS NULL THEN
    RAISE EXCEPTION 'order_id_and_tenant_required';
  END IF;

  IF NOT public.tenant_id_matches(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_mismatch';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.order_id = btrim(p_order_id)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  v_lab_id := btrim(v_order.lab_id);
  v_status_norm := lower(btrim(COALESCE(v_order.status, '')));

  IF v_status_norm NOT IN ('fulfilled', 'delivered', 'completed', 'received') THEN
    RAISE EXCEPTION 'order_not_fulfilled';
  END IF;

  IF NOT (
    public.can_write_ops_for_tenant(p_tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.primecare_normalize_lab_id(v_lab_id) = public.current_profile_lab_id()
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Idempotent: order already linked
  IF v_order.invoice_id IS NOT NULL THEN
    SELECT i.id, i.invoice_number, i.status
    INTO v_invoice_id, v_invoice_number, v_status_norm
    FROM public.invoices i
    WHERE i.id = v_order.invoice_id
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'skipped', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'order_id', v_order.order_id,
        'status', v_status_norm
      );
    END IF;
  END IF;

  -- Idempotent: invoice row exists for order
  SELECT i.id, i.invoice_number, i.status
  INTO v_invoice_id, v_invoice_number, v_status_norm
  FROM public.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.order_id = v_order.order_id
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    UPDATE public.orders
    SET invoice_id = v_invoice_id,
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND order_id = v_order.order_id
      AND invoice_id IS NULL;

    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'order_id', v_order.order_id,
      'status', v_status_norm,
      'relinked', true
    );
  END IF;

  SELECT l.lab_name
  INTO v_lab_name
  FROM public.labs l
  WHERE l.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(l.lab_id) = public.primecare_normalize_lab_id(v_lab_id)
  LIMIT 1;

  SELECT COALESCE(ar.allowed_overdue_days, 15)
  INTO v_payment_terms
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(ar.lab_id) = public.primecare_normalize_lab_id(v_lab_id)
  LIMIT 1;

  IF v_payment_terms IS NULL OR v_payment_terms < 0 THEN
    v_payment_terms := 15;
  END IF;

  v_invoice_number := public.allocate_invoice_number(p_tenant_id);

  INSERT INTO public.invoices (
    tenant_id,
    lab_id,
    order_id,
    invoice_number,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total_amount,
    status,
    lab_name_snapshot,
    payment_terms_days_snapshot,
    created_by,
    created_source
  )
  VALUES (
    p_tenant_id,
    v_lab_id,
    v_order.order_id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + make_interval(days => v_payment_terms),
    0,
    0,
    0,
    'draft',
    v_lab_name,
    v_payment_terms,
    nullif(btrim(p_actor_id), ''),
    nullif(btrim(p_created_source), '')
  )
  RETURNING id INTO v_invoice_id;

  FOR v_line IN
    SELECT
      oi.product_id,
      oi.product_name,
      oi.quantity,
      oi.unit_price,
      oi.total_price
    FROM public.order_items oi
    WHERE oi.order_id = v_order.order_id
    ORDER BY oi.created_at NULLS LAST, oi.order_item_id NULLS LAST, oi.id
  LOOP
    v_line_no := v_line_no + 1;
    v_tax_amount := 0;
    v_line_total := round(COALESCE(v_line.total_price, v_line.quantity * v_line.unit_price, 0)::numeric, 2);

    INSERT INTO public.invoice_line_items (
      tenant_id,
      invoice_id,
      line_number,
      order_id,
      product_id,
      product_name,
      sku,
      quantity,
      unit_price,
      tax_rate,
      tax_amount,
      line_total
    )
    VALUES (
      p_tenant_id,
      v_invoice_id,
      v_line_no,
      v_order.order_id,
      nullif(btrim(v_line.product_id), ''),
      COALESCE(nullif(btrim(v_line.product_name), ''), nullif(btrim(v_line.product_id), ''), 'Line item'),
      nullif(btrim(v_line.product_id), ''),
      v_line.quantity,
      COALESCE(v_line.unit_price, 0),
      0,
      v_tax_amount,
      v_line_total
    );

    v_subtotal := v_subtotal + v_line_total;
    v_tax_total := v_tax_total + v_tax_amount;
  END LOOP;

  IF v_line_no = 0 THEN
    v_total := round(COALESCE(v_order.total_amount, 0)::numeric, 2);
    v_subtotal := v_total;
    v_tax_total := 0;

    IF v_total > 0 THEN
      INSERT INTO public.invoice_line_items (
        tenant_id,
        invoice_id,
        line_number,
        order_id,
        product_id,
        product_name,
        sku,
        quantity,
        unit_price,
        tax_rate,
        tax_amount,
        line_total
      )
      VALUES (
        p_tenant_id,
        v_invoice_id,
        1,
        v_order.order_id,
        NULL,
        'Order total',
        NULL,
        1,
        v_total,
        0,
        0,
        v_total
      );
      v_line_no := 1;
    END IF;
  ELSE
    v_total := round(v_subtotal + v_tax_total, 2);
    v_subtotal := round(v_subtotal, 2);
    v_tax_total := round(v_tax_total, 2);
  END IF;

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    tax_amount = v_tax_total,
    total_amount = v_total,
    updated_at = now()
  WHERE id = v_invoice_id;

  UPDATE public.orders
  SET
    invoice_id = v_invoice_id,
    updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND order_id = v_order.order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_linkage_failed';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'skipped', false,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'order_id', v_order.order_id,
    'status', 'draft',
    'line_count', v_line_no,
    'subtotal', v_subtotal,
    'tax_amount', v_tax_total,
    'total_amount', v_total
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT i.id, i.invoice_number, i.status
    INTO v_invoice_id, v_invoice_number, v_status_norm
    FROM public.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.order_id = btrim(p_order_id)
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
      UPDATE public.orders
      SET invoice_id = v_invoice_id,
          updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND order_id = btrim(p_order_id);

      RETURN jsonb_build_object(
        'success', true,
        'skipped', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'order_id', btrim(p_order_id),
        'status', v_status_norm,
        'race_resolved', true
      );
    END IF;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_for_fulfilled_order(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_invoice_for_fulfilled_order IS
  'Creates draft invoice + immutable line snapshot for a fulfilled order. Idempotent per tenant+order_id.';

COMMENT ON FUNCTION public.allocate_invoice_number IS
  'Thread-safe yearly invoice numbers: INV-YYYY-NNNNNN scoped per tenant.';
