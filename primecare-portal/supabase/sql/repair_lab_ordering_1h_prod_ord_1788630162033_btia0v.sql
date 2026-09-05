-- Lab Ordering 1H — exact-order Production AR repair
--
-- DO NOT EXECUTE until Founder approval AFTER 20260905150000 is applied on
-- Production (GRANT UPDATE + DROP 2-arg projection overloads).
--
-- Forbidden:
--   - updateOrderStatusWrite / fulfill rerun
--   - deduct_inventory_for_order
--   - inventory PATCH
--   - second invoice or shipment
--   - delivery charge / ordering_mode changes
--
-- Target:
--   tenant 6c83b03f-2993-4aef-88a2-f23c42f242e8
--   order  ORD-1788630162033-btia0v
--   lab    LAB-TEST-42VF
--   amount 1000 (merchandise total_amount; not delivery 150)
--
-- Idempotent: if orders.ar_posted is already true, do not increment AR.

DO $$
DECLARE
  v_tenant uuid := '6c83b03f-2993-4aef-88a2-f23c42f242e8';
  v_order text := 'ORD-1788630162033-btia0v';
  v_lab text := 'LAB-TEST-42VF';
  v_amt numeric := 1000;
  v_ord public.orders%ROWTYPE;
  v_ledger_count integer;
  v_stock numeric;
  v_inv_total numeric;
  v_ar_rows integer;
  v_ord_rows integer;
BEGIN
  SELECT * INTO v_ord
  FROM public.orders
  WHERE tenant_id = v_tenant
    AND order_id = v_order
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'repair_precondition_order_missing';
  END IF;
  IF v_ord.status IS DISTINCT FROM 'Fulfilled' THEN
    RAISE EXCEPTION 'repair_precondition_status';
  END IF;
  IF v_ord.inventory_updated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'repair_precondition_inventory_updated';
  END IF;
  IF btrim(COALESCE(v_ord.lab_id, '')) IS DISTINCT FROM v_lab THEN
    RAISE EXCEPTION 'repair_precondition_lab_id';
  END IF;
  IF COALESCE(v_ord.total_amount, 0) IS DISTINCT FROM v_amt THEN
    RAISE EXCEPTION 'repair_precondition_total_amount';
  END IF;
  IF v_ord.invoice_id IS NULL THEN
    RAISE EXCEPTION 'repair_precondition_invoice_id';
  END IF;

  SELECT COUNT(*)::integer INTO v_ledger_count
  FROM public.inventory_ledger
  WHERE tenant_id = v_tenant
    AND order_id = v_order
    AND movement_type = 'ORDER_OUT'
    AND product_id = 'PROD_TEST_001'
    AND quantity = 1;
  IF v_ledger_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'repair_precondition_order_out';
  END IF;

  SELECT i.current_stock INTO v_stock
  FROM public.inventory i
  WHERE i.tenant_id = v_tenant
    AND i.product_id = 'PROD_TEST_001';
  IF v_stock IS DISTINCT FROM 229 THEN
    RAISE EXCEPTION 'repair_precondition_stock';
  END IF;

  SELECT inv.total_amount INTO v_inv_total
  FROM public.invoices inv
  WHERE inv.id = v_ord.invoice_id;
  IF v_inv_total IS DISTINCT FROM v_amt THEN
    RAISE EXCEPTION 'repair_precondition_invoice_total';
  END IF;

  IF v_ord.ar_posted IS TRUE THEN
    PERFORM public.refresh_proj_order_row_v1(v_tenant, v_order, true);
    PERFORM public.refresh_proj_lab_receivable_row_v1(v_tenant, v_lab, true);
    RAISE NOTICE 'repair_skipped_already_posted';
    RETURN;
  END IF;

  IF v_ord.ar_posted IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'repair_precondition_ar_posted';
  END IF;

  UPDATE public.ar_credit_control
  SET
    outstanding = COALESCE(outstanding, 0) + v_amt,
    total_delivered = COALESCE(total_delivered, 0) + v_amt,
    updated_at = now()
  WHERE tenant_id = v_tenant
    AND lab_id = v_lab;
  GET DIAGNOSTICS v_ar_rows = ROW_COUNT;
  IF v_ar_rows IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'repair_ar_row_count';
  END IF;

  UPDATE public.orders
  SET ar_posted = true,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND order_id = v_order
    AND ar_posted IS DISTINCT FROM true;
  GET DIAGNOSTICS v_ord_rows = ROW_COUNT;
  IF v_ord_rows IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'repair_order_row_count';
  END IF;

  PERFORM public.refresh_proj_order_row_v1(v_tenant, v_order, true);
  PERFORM public.refresh_proj_lab_receivable_row_v1(v_tenant, v_lab, true);
END $$;
