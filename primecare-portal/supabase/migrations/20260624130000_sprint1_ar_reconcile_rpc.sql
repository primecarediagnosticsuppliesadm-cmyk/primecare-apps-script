-- Sprint 1: idempotent AR reconciliation from payments (ops / scheduled job).
CREATE OR REPLACE FUNCTION public.reconcile_ar_from_payments(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated bigint := 0;
  v_zeroed bigint := 0;
BEGIN
  IF p_tenant_id IS NOT NULL AND NOT public.tenant_id_matches(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_mismatch';
  END IF;

  ALTER TABLE public.ar_credit_control
    ADD COLUMN IF NOT EXISTS total_paid numeric NOT NULL DEFAULT 0;
  ALTER TABLE public.ar_credit_control
    ADD COLUMN IF NOT EXISTS outstanding numeric;
  ALTER TABLE public.ar_credit_control
    ADD COLUMN IF NOT EXISTS total_delivered numeric NOT NULL DEFAULT 0;
  ALTER TABLE public.ar_credit_control
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

  WITH pay AS (
    SELECT
      public.primecare_normalize_lab_id(p.lab_id) AS lab_key,
      COALESCE(SUM(COALESCE(p.amount_received, 0)), 0)::numeric AS total_paid_from_payments
    FROM public.payments AS p
    WHERE p.lab_id IS NOT NULL
      AND btrim(p.lab_id) <> ''
      AND (p_tenant_id IS NULL OR p.tenant_id::text = p_tenant_id::text)
    GROUP BY public.primecare_normalize_lab_id(p.lab_id)
  ),
  upd AS (
    UPDATE public.ar_credit_control AS ar
    SET
      total_paid = COALESCE(pay.total_paid_from_payments, 0),
      outstanding = CASE
        WHEN COALESCE(ar.total_delivered, 0) > 0 THEN GREATEST(
          COALESCE(ar.total_delivered, 0) - COALESCE(pay.total_paid_from_payments, 0),
          0
        )
        ELSE ar.outstanding
      END,
      updated_at = now()
    FROM pay
    WHERE public.primecare_normalize_lab_id(ar.lab_id) = pay.lab_key
      AND (p_tenant_id IS NULL OR ar.tenant_id::text = p_tenant_id::text)
    RETURNING 1
  )
  SELECT COUNT(*)::bigint INTO v_updated FROM upd;

  WITH zero AS (
    UPDATE public.ar_credit_control AS ar
    SET
      total_paid = 0,
      outstanding = CASE
        WHEN COALESCE(ar.total_delivered, 0) > 0 THEN COALESCE(ar.total_delivered, 0)
        ELSE ar.outstanding
      END,
      updated_at = now()
    WHERE public.primecare_normalize_lab_id(ar.lab_id) IS NOT NULL
      AND (p_tenant_id IS NULL OR ar.tenant_id::text = p_tenant_id::text)
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments AS p
        WHERE public.primecare_normalize_lab_id(p.lab_id)
          = public.primecare_normalize_lab_id(ar.lab_id)
          AND (p_tenant_id IS NULL OR p.tenant_id::text = p_tenant_id::text)
      )
    RETURNING 1
  )
  SELECT COUNT(*)::bigint INTO v_zeroed FROM zero;

  RETURN jsonb_build_object(
    'success', true,
    'rows_reconciled', v_updated,
    'rows_zeroed', v_zeroed,
    'tenant_id', p_tenant_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_ar_from_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_ar_from_payments(uuid) TO service_role;

COMMENT ON FUNCTION public.reconcile_ar_from_payments IS
  'Recompute ar_credit_control.total_paid/outstanding from payments. Idempotent.';
