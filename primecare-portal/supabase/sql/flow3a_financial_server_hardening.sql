-- Flow 3A — Financial server hardening (QA only).
-- Do NOT apply to Production from this sprint.
--
-- - Atomic linked payment: payment + AR + allocation in one TX
-- - Idempotency via payments.client_request_id
-- - Reject overpayment (no GREATEST floor hiding surplus)
-- - AR financial columns RPC-only (preserve notes/follow-up UPDATE)
-- - Authenticated cannot INSERT/UPDATE/DELETE payments
-- - Flow 1 fulfill AR via post_fulfillment_ar_bump
-- Does not change Flow 2, invoice schema, or payments.invoice_id.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS collected_by text,
  ADD COLUMN IF NOT EXISTS agent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_client_request_uidx
  ON public.payments (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND btrim(client_request_id) <> '';

COMMENT ON COLUMN public.payments.client_request_id IS
  'Flow 3A idempotency key. UNIQUE (tenant_id, client_request_id).';
COMMENT ON COLUMN public.payments.created_by_user_id IS
  'auth.uid() of the poster; set by post_collection_payment.';

-- ---------------------------------------------------------------------------
-- AR: authenticated may still UPDATE operational columns; financial ledger
-- columns only change inside SECURITY DEFINER RPCs (owner is not authenticated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ar_credit_protect_financial_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_user IN ('authenticated', 'anon')
     AND (
       NEW.outstanding IS DISTINCT FROM OLD.outstanding
       OR NEW.total_paid IS DISTINCT FROM OLD.total_paid
       OR NEW.total_delivered IS DISTINCT FROM OLD.total_delivered
     ) THEN
    RAISE EXCEPTION 'ar_financial_columns_rpc_only'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ar_credit_protect_financial_columns_trg ON public.ar_credit_control;
CREATE TRIGGER ar_credit_protect_financial_columns_trg
  BEFORE UPDATE ON public.ar_credit_control
  FOR EACH ROW
  EXECUTE FUNCTION public.ar_credit_protect_financial_columns();

-- ---------------------------------------------------------------------------
-- payments: SELECT remains; table DML denied for authenticated (RPC DEFINER writes).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payments_insert_by_role" ON public.payments;
DROP POLICY IF EXISTS "payments_update_by_role" ON public.payments;
DROP POLICY IF EXISTS "payments_delete_by_role" ON public.payments;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM anon;
GRANT SELECT ON TABLE public.payments TO authenticated;

-- ---------------------------------------------------------------------------
-- Flow 1 compatibility: server-authoritative fulfill AR bump
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_fulfillment_ar_bump(
  p_tenant_id text,
  p_lab_id text,
  p_order_id text,
  p_delta_amount numeric
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
  v_oid text;
  v_delta numeric;
  v_ar public.ar_credit_control%ROWTYPE;
  v_posted boolean;
  v_new_out numeric;
  v_new_del numeric;
BEGIN
  v_lab := public.primecare_normalize_lab_id(p_lab_id);
  v_tid := nullif(btrim(p_tenant_id), '');
  v_oid := nullif(btrim(p_order_id), '');
  v_delta := COALESCE(p_delta_amount, 0);

  IF v_lab IS NULL OR v_tid IS NULL THEN
    RAISE EXCEPTION 'ar_bump_args_required' USING ERRCODE = 'P0001';
  END IF;

  v_tid_uuid := v_tid::uuid;

  IF NOT public.can_write_ops_for_tenant(v_tid_uuid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;

  IF v_delta <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'non_positive_delta');
  END IF;

  IF v_oid IS NOT NULL THEN
    SELECT COALESCE(o.ar_posted, false) INTO v_posted
    FROM public.orders o
    WHERE o.tenant_id = v_tid_uuid
      AND o.order_id = v_oid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF v_posted THEN
      RETURN jsonb_build_object(
        'success', true,
        'skipped', false,
        'idempotent', true,
        'already_posted', true
      );
    END IF;
  END IF;

  SELECT * INTO v_ar
  FROM public.ar_credit_control
  WHERE tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(lab_id) = v_lab
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ar_row_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_new_out := COALESCE(v_ar.outstanding, 0) + v_delta;
  v_new_del := COALESCE(v_ar.total_delivered, 0) + v_delta;

  UPDATE public.ar_credit_control
  SET
    outstanding = v_new_out,
    total_delivered = v_new_del,
    updated_at = now()
  WHERE tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(lab_id) = v_lab;

  IF v_oid IS NOT NULL THEN
    UPDATE public.orders
    SET ar_posted = true,
        updated_at = now()
    WHERE tenant_id = v_tid_uuid
      AND order_id = v_oid
      AND COALESCE(ar_posted, false) = false;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'skipped', false,
    'idempotent', false,
    'ar', jsonb_build_object(
      'lab_id', v_lab,
      'outstanding', v_new_out,
      'total_delivered', v_new_del
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_fulfillment_ar_bump(text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_fulfillment_ar_bump(text, text, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- post_collection_payment — replace signature (drop 9-arg form)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.post_collection_payment(text, text, text, numeric, text, date, text, text, text);

CREATE OR REPLACE FUNCTION public.post_collection_payment(
  p_tenant_id text,
  p_lab_id text,
  p_payment_id text,
  p_amount_received numeric,
  p_client_request_id text,
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
  v_crid text;
  v_oid text;
  v_mode text;
  v_actor uuid;
  v_role text;
  v_agent text;
  v_ar public.ar_credit_control%ROWTYPE;
  v_pay public.payments%ROWTYPE;
  v_invoice record;
  v_open numeric(12, 2);
  v_old_out numeric;
  v_old_paid numeric;
  v_new_out numeric;
  v_new_paid numeric;
  v_alloc jsonb;
  v_lock_a int;
  v_lock_b int;
BEGIN
  v_lab := public.primecare_normalize_lab_id(p_lab_id);
  v_tid := nullif(btrim(p_tenant_id), '');
  v_crid := nullif(btrim(p_client_request_id), '');
  v_oid := nullif(btrim(p_order_id), '');
  v_mode := COALESCE(nullif(btrim(p_mode), ''), 'Cash');
  v_actor := auth.uid();
  v_role := public.current_user_role();

  IF v_lab IS NULL OR v_tid IS NULL OR v_crid IS NULL THEN
    RAISE EXCEPTION 'payment_args_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_received IS NULL OR p_amount_received <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  v_tid_uuid := v_tid::uuid;
  v_pid := COALESCE(nullif(btrim(p_payment_id), ''), 'PAY-' || replace(v_crid, '-', ''));

  IF NOT (
    public.can_write_ops_for_tenant(v_tid_uuid)
    OR (
      v_role = 'agent'
      AND public.lab_record_is_visible_to_current_user(v_tid_uuid, v_lab)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;

  IF v_role = 'lab' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;

  v_lock_a := hashtext('primecare.post_collection_payment');
  v_lock_b := hashtext(v_tid || ':' || v_crid);
  PERFORM pg_advisory_xact_lock(v_lock_a, v_lock_b);

  SELECT * INTO v_pay
  FROM public.payments
  WHERE tenant_id = v_tid_uuid
    AND client_request_id = v_crid
  LIMIT 1;

  IF FOUND THEN
    IF public.primecare_normalize_lab_id(v_pay.lab_id) IS DISTINCT FROM v_lab
       OR v_pay.amount_received IS DISTINCT FROM p_amount_received
       OR nullif(btrim(COALESCE(v_pay.order_id, '')), '') IS DISTINCT FROM v_oid THEN
      RAISE EXCEPTION 'idempotency_payload_conflict' USING ERRCODE = 'P0001';
    END IF;

    SELECT jsonb_build_object(
      'success', true,
      'idempotent', true,
      'allocation_id', a.id,
      'payment_id', a.payment_id,
      'invoice_id', a.invoice_id,
      'allocated_amount', a.allocated_amount,
      'open_balance', public.get_invoice_open_balance(a.invoice_id),
      'invoice_status', (SELECT i.status FROM public.invoices i WHERE i.id = a.invoice_id)
    )
    INTO v_alloc
    FROM public.invoice_payment_allocations a
    WHERE a.tenant_id = v_tid_uuid
      AND a.payment_id = v_pay.payment_id
    ORDER BY a.created_at
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'payment', row_to_json(v_pay),
      'allocation', v_alloc,
      'ar', jsonb_build_object(
        'lab_id', v_lab,
        'total_paid', (
          SELECT COALESCE(total_paid, 0) FROM public.ar_credit_control
          WHERE tenant_id = v_tid_uuid
            AND public.primecare_normalize_lab_id(lab_id) = v_lab
          LIMIT 1
        ),
        'outstanding', (
          SELECT COALESCE(outstanding, 0) FROM public.ar_credit_control
          WHERE tenant_id = v_tid_uuid
            AND public.primecare_normalize_lab_id(lab_id) = v_lab
          LIMIT 1
        )
      )
    );
  END IF;

  SELECT * INTO v_ar
  FROM public.ar_credit_control
  WHERE tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(lab_id) = v_lab
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ar_row_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_old_out := COALESCE(v_ar.outstanding, 0);
  v_old_paid := COALESCE(v_ar.total_paid, 0);

  IF p_amount_received > v_old_out THEN
    RAISE EXCEPTION 'payment_exceeds_receivable' USING ERRCODE = 'P0001';
  END IF;

  IF v_oid IS NOT NULL THEN
    SELECT i.id, i.tenant_id, i.lab_id, i.status, i.total_amount, i.order_id,
           i.pdf_storage_path, i.sent_at
    INTO v_invoice
    FROM public.invoices i
    WHERE i.tenant_id = v_tid_uuid
      AND i.order_id = v_oid
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF public.primecare_normalize_lab_id(v_invoice.lab_id) IS DISTINCT FROM v_lab THEN
      RAISE EXCEPTION 'payment_invoice_lab_mismatch' USING ERRCODE = 'P0001';
    END IF;

    IF v_invoice.status NOT IN ('sent', 'partially_paid')
       OR v_invoice.pdf_storage_path IS NULL
       OR v_invoice.sent_at IS NULL THEN
      RAISE EXCEPTION 'invoice_not_allocatable' USING ERRCODE = 'P0001';
    END IF;

    v_open := public.get_invoice_open_balance(v_invoice.id);
    IF p_amount_received > v_open THEN
      RAISE EXCEPTION 'payment_exceeds_receivable' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_new_paid := v_old_paid + p_amount_received;
  v_new_out := v_old_out - p_amount_received;

  IF v_role = 'agent' THEN
    v_agent := public.current_profile_agent_id();
  END IF;

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
    order_id,
    client_request_id,
    created_by_user_id,
    agent_id
  )
  VALUES (
    v_pid,
    v_tid_uuid,
    v_lab,
    p_amount_received,
    COALESCE(p_payment_date, CURRENT_DATE),
    v_mode,
    v_new_out,
    now(),
    nullif(btrim(p_note), ''),
    nullif(btrim(p_collected_by), ''),
    v_oid,
    v_crid,
    v_actor,
    nullif(btrim(COALESCE(v_agent, '')), '')
  )
  RETURNING * INTO v_pay;

  UPDATE public.ar_credit_control
  SET
    total_paid = v_new_paid,
    outstanding = v_new_out,
    updated_at = now()
  WHERE tenant_id = v_tid_uuid
    AND public.primecare_normalize_lab_id(lab_id) = v_lab;

  IF v_oid IS NOT NULL THEN
    v_alloc := public.allocate_payment_to_invoice(
      v_tid_uuid,
      v_pid,
      v_invoice.id,
      p_amount_received,
      COALESCE(nullif(btrim(p_collected_by), ''), v_actor::text)
    );
  END IF;

  IF to_regclass('public.event_log') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.event_log (
        tenant_id,
        event_type,
        entity_type,
        entity_id,
        severity,
        message,
        payload
      )
      VALUES (
        v_tid_uuid,
        'collection_payment_posted',
        'payment',
        v_pid,
        'INFO',
        'collection payment posted',
        jsonb_build_object(
          'payment_id', v_pid,
          'client_request_id', v_crid,
          'lab_id', v_lab,
          'amount_received', p_amount_received,
          'mode', v_mode,
          'order_id', v_oid,
          'invoice_id', CASE WHEN v_oid IS NULL THEN NULL ELSE v_invoice.id END,
          'actor_user_id', v_actor,
          'role', v_role,
          'outstanding_before', v_old_out,
          'outstanding_after', v_new_out,
          'total_paid_after', v_new_paid
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'payment', row_to_json(v_pay),
    'allocation', v_alloc,
    'ar', jsonb_build_object(
      'lab_id', v_lab,
      'total_paid', v_new_paid,
      'outstanding', v_new_out
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_collection_payment(text, text, text, numeric, text, text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_collection_payment(text, text, text, numeric, text, text, date, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
