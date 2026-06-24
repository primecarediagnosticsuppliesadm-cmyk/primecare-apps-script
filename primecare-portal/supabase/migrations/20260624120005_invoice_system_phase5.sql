-- PrimeCare Invoice System — Phase 5: payment allocation & invoice balance reconciliation.
-- Run after invoice_system_phase1/2/3 migrations. Idempotent.
-- Does NOT modify AR ledger logic, collections payment insert shape, or commission flows.

-- ---------------------------------------------------------------------------
-- Invoice status: add partially_paid (overdue remains computed at read time)
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN ('draft', 'sent', 'partially_paid', 'paid', 'cancelled', 'failed')
);

-- ---------------------------------------------------------------------------
-- Allocation trigger: allow sent + partially_paid invoices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_payment_allocations_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_amount numeric(12, 2);
  v_payment_tenant uuid;
  v_payment_lab text;
  v_invoice_tenant uuid;
  v_invoice_lab text;
  v_invoice_status text;
  v_existing_sum numeric(12, 2);
  v_new_total numeric(12, 2);
BEGIN
  SELECT p.amount_received, p.tenant_id, p.lab_id
  INTO v_payment_amount, v_payment_tenant, v_payment_lab
  FROM public.payments p
  WHERE p.payment_id = NEW.payment_id
    AND p.tenant_id = NEW.tenant_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_payment_tenant THEN
    RAISE EXCEPTION 'payment_tenant_mismatch';
  END IF;

  SELECT i.tenant_id, i.lab_id, i.status
  INTO v_invoice_tenant, v_invoice_lab, v_invoice_status
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_invoice_tenant THEN
    RAISE EXCEPTION 'invoice_tenant_mismatch';
  END IF;

  IF v_payment_lab IS NOT NULL
    AND v_invoice_lab IS NOT NULL
    AND public.primecare_normalize_lab_id(v_payment_lab)
      IS DISTINCT FROM public.primecare_normalize_lab_id(v_invoice_lab) THEN
    RAISE EXCEPTION 'payment_invoice_lab_mismatch';
  END IF;

  IF TG_OP = 'INSERT' AND v_invoice_status NOT IN ('sent', 'partially_paid') THEN
    RAISE EXCEPTION 'invoice_not_allocatable';
  END IF;

  SELECT COALESCE(SUM(a.allocated_amount), 0)
  INTO v_existing_sum
  FROM public.invoice_payment_allocations a
  WHERE a.tenant_id = NEW.tenant_id
    AND a.payment_id = NEW.payment_id
    AND a.id IS DISTINCT FROM COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_new_total := v_existing_sum + NEW.allocated_amount;

  IF v_new_total > v_payment_amount THEN
    RAISE EXCEPTION 'allocation_exceeds_payment';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Sync invoice status from allocation totals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_invoice_allocation_status(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12, 2);
  v_allocated numeric(12, 2);
  v_status text;
  v_new_status text;
BEGIN
  SELECT i.total_amount, i.status
  INTO v_total, v_status
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_status IN ('cancelled', 'failed', 'draft') THEN
    RETURN v_status;
  END IF;

  SELECT COALESCE(SUM(a.allocated_amount), 0)
  INTO v_allocated
  FROM public.invoice_payment_allocations a
  WHERE a.invoice_id = p_invoice_id;

  IF v_allocated >= v_total AND v_status IN ('sent', 'partially_paid') THEN
    PERFORM public.mark_invoice_paid_if_fully_allocated(p_invoice_id);
    SELECT status INTO v_new_status FROM public.invoices WHERE id = p_invoice_id;
    RETURN v_new_status;
  END IF;

  IF v_allocated > 0 AND v_allocated < v_total THEN
    UPDATE public.invoices
    SET status = 'partially_paid', updated_at = now()
    WHERE id = p_invoice_id
      AND status IN ('sent', 'partially_paid');
    RETURN 'partially_paid';
  END IF;

  IF v_allocated = 0 AND v_status = 'partially_paid' THEN
    UPDATE public.invoices
    SET status = 'sent', updated_at = now()
    WHERE id = p_invoice_id
      AND status = 'partially_paid';
    RETURN 'sent';
  END IF;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_invoice_paid_if_fully_allocated(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12, 2);
  v_allocated numeric(12, 2);
  v_status text;
BEGIN
  SELECT i.total_amount, i.status
  INTO v_total, v_status
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT COALESCE(SUM(a.allocated_amount), 0)
  INTO v_allocated
  FROM public.invoice_payment_allocations a
  WHERE a.invoice_id = p_invoice_id;

  IF v_status IN ('sent', 'partially_paid') AND v_allocated >= v_total THEN
    UPDATE public.invoices
    SET
      status = 'paid',
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
    WHERE id = p_invoice_id
      AND status IN ('sent', 'partially_paid');
    RETURN FOUND;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- allocate_payment_to_invoice — production implementation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_payment_to_invoice(
  p_tenant_id uuid,
  p_payment_id text,
  p_invoice_id uuid,
  p_allocated_amount numeric,
  p_actor_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_invoice record;
  v_open_balance numeric(12, 2);
  v_alloc_id uuid;
  v_existing_id uuid;
  v_existing_amount numeric(12, 2);
  v_status text;
BEGIN
  IF p_tenant_id IS NULL OR nullif(btrim(p_payment_id), '') IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'allocation_args_required';
  END IF;

  IF p_allocated_amount IS NULL OR p_allocated_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_allocation_amount';
  END IF;

  IF NOT public.tenant_id_matches(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_mismatch';
  END IF;

  SELECT p.payment_id, p.tenant_id, p.lab_id, p.amount_received, p.order_id
  INTO v_payment
  FROM public.payments p
  WHERE p.tenant_id = p_tenant_id
    AND p.payment_id = btrim(p_payment_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  SELECT i.id, i.tenant_id, i.lab_id, i.status, i.total_amount, i.order_id
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.tenant_id = p_tenant_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  IF NOT (
    public.can_write_ops_for_tenant(p_tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(p_tenant_id, v_invoice.lab_id)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_payment.lab_id IS NOT NULL
    AND v_invoice.lab_id IS NOT NULL
    AND public.primecare_normalize_lab_id(v_payment.lab_id)
      IS DISTINCT FROM public.primecare_normalize_lab_id(v_invoice.lab_id) THEN
    RAISE EXCEPTION 'payment_invoice_lab_mismatch';
  END IF;

  v_open_balance := public.get_invoice_open_balance(p_invoice_id);

  IF p_allocated_amount > v_open_balance THEN
    RAISE EXCEPTION 'allocation_exceeds_invoice_balance';
  END IF;

  SELECT a.id, a.allocated_amount
  INTO v_existing_id, v_existing_amount
  FROM public.invoice_payment_allocations a
  WHERE a.tenant_id = p_tenant_id
    AND a.payment_id = btrim(p_payment_id)
    AND a.invoice_id = p_invoice_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_amount = p_allocated_amount THEN
      v_status := public.sync_invoice_allocation_status(p_invoice_id);
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'allocation_id', v_existing_id,
        'payment_id', btrim(p_payment_id),
        'invoice_id', p_invoice_id,
        'allocated_amount', v_existing_amount,
        'open_balance', public.get_invoice_open_balance(p_invoice_id),
        'invoice_status', (SELECT status FROM public.invoices WHERE id = p_invoice_id)
      );
    END IF;
    RAISE EXCEPTION 'allocation_already_exists';
  END IF;

  INSERT INTO public.invoice_payment_allocations (
    tenant_id,
    payment_id,
    invoice_id,
    allocated_amount,
    created_by
  )
  VALUES (
    p_tenant_id,
    btrim(p_payment_id),
    p_invoice_id,
    p_allocated_amount,
    nullif(btrim(p_actor_id), '')
  )
  RETURNING id INTO v_alloc_id;

  v_status := public.sync_invoice_allocation_status(p_invoice_id);

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'allocation_id', v_alloc_id,
    'payment_id', btrim(p_payment_id),
    'invoice_id', p_invoice_id,
    'allocated_amount', p_allocated_amount,
    'open_balance', public.get_invoice_open_balance(p_invoice_id),
    'invoice_status', (SELECT status FROM public.invoices WHERE id = p_invoice_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Tenant financial KPIs (allocation-based, bounded aggregates)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invoice_tenant_financial_kpis(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_total_invoices bigint;
  v_invoice_value numeric(12, 2);
  v_paid_value numeric(12, 2);
  v_outstanding_value numeric(12, 2);
  v_overdue_value numeric(12, 2);
  v_paid_count bigint;
  v_outstanding_count bigint;
  v_overdue_count bigint;
  v_payments_total numeric(12, 2);
  v_allocated_total numeric(12, 2);
  v_unallocated_cash numeric(12, 2);
  v_collection_pct numeric(12, 2);
BEGIN
  IF p_tenant_id IS NULL OR NOT public.tenant_id_matches(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_mismatch';
  END IF;

  SELECT COUNT(*)::bigint, COALESCE(SUM(i.total_amount), 0)
  INTO v_total_invoices, v_invoice_value
  FROM public.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.status NOT IN ('cancelled', 'failed');

  SELECT
    COUNT(*) FILTER (WHERE i.status = 'paid')::bigint,
    COALESCE(SUM(i.total_amount) FILTER (WHERE i.status = 'paid'), 0)
  INTO v_paid_count, v_paid_value
  FROM public.invoices i
  WHERE i.tenant_id = p_tenant_id;

  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(public.get_invoice_open_balance(i.id)), 0)
  INTO v_outstanding_count, v_outstanding_value
  FROM public.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.status IN ('sent', 'partially_paid');

  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(public.get_invoice_open_balance(i.id)), 0)
  INTO v_overdue_count, v_overdue_value
  FROM public.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.status IN ('sent', 'partially_paid')
    AND i.due_date < v_today;

  SELECT COALESCE(SUM(p.amount_received), 0)
  INTO v_payments_total
  FROM public.payments p
  WHERE p.tenant_id = p_tenant_id;

  SELECT COALESCE(SUM(a.allocated_amount), 0)
  INTO v_allocated_total
  FROM public.invoice_payment_allocations a
  WHERE a.tenant_id = p_tenant_id;

  v_unallocated_cash := GREATEST(0::numeric, v_payments_total - v_allocated_total);

  IF v_invoice_value > 0 THEN
    v_collection_pct := ROUND((v_paid_value / v_invoice_value) * 100::numeric, 2);
  ELSE
    v_collection_pct := 0;
  END IF;

  RETURN jsonb_build_object(
    'total_invoices', v_total_invoices,
    'invoice_value', v_invoice_value,
    'paid_count', v_paid_count,
    'paid_value', v_paid_value,
    'outstanding_count', v_outstanding_count,
    'outstanding_value', v_outstanding_value,
    'overdue_count', v_overdue_count,
    'overdue_value', v_overdue_value,
    'unallocated_cash', v_unallocated_cash,
    'collection_pct', v_collection_pct
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invoice_allocation_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_invoice_allocation_status(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.allocate_payment_to_invoice(uuid, text, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_payment_to_invoice(uuid, text, uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_invoice_tenant_financial_kpis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_tenant_financial_kpis(uuid) TO authenticated;
