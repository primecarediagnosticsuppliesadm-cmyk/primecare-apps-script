-- PrimeCare Day 1: Reconcile ar_credit_control from payments
-- Run AFTER lab_id_normalization_migration.sql
-- Non-destructive: UPDATE ar_credit_control only (no DELETE).
-- Idempotent — safe to re-run.
--
-- Rules:
--   total_paid  := SUM(payments.amount_received) per normalized lab_id
--   outstanding := IF total_delivered > 0
--                    THEN GREATEST(total_delivered - total_paid, 0)
--                    ELSE keep existing ar.outstanding

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ar_credit_control'
  ) THEN
    RAISE NOTICE 'ar_credit_control table not found — skip reconcile';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments'
  ) THEN
    RAISE NOTICE 'payments table not found — skip reconcile';
    RETURN;
  END IF;
END $$;

-- Ensure reconcile columns exist
ALTER TABLE public.ar_credit_control
  ADD COLUMN IF NOT EXISTS total_paid numeric NOT NULL DEFAULT 0;

ALTER TABLE public.ar_credit_control
  ADD COLUMN IF NOT EXISTS outstanding numeric;

ALTER TABLE public.ar_credit_control
  ADD COLUMN IF NOT EXISTS total_delivered numeric NOT NULL DEFAULT 0;

ALTER TABLE public.ar_credit_control
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Reconcile every AR row (payment sum subquery; zero if no payments)
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
FROM (
  SELECT
    public.primecare_normalize_lab_id(p.lab_id) AS lab_id,
    COALESCE(SUM(COALESCE(p.amount_received, 0)), 0)::numeric AS total_paid_from_payments
  FROM public.payments AS p
  WHERE p.lab_id IS NOT NULL
    AND btrim(p.lab_id) <> ''
  GROUP BY public.primecare_normalize_lab_id(p.lab_id)
) AS pay
WHERE public.primecare_normalize_lab_id(ar.lab_id) = pay.lab_id;

-- AR rows with no matching payment row: set total_paid = 0, leave outstanding unless total_delivered applies
UPDATE public.ar_credit_control AS ar
SET
  total_paid = 0,
  outstanding = CASE
    WHEN COALESCE(ar.total_delivered, 0) > 0 THEN COALESCE(ar.total_delivered, 0)
    ELSE ar.outstanding
  END,
  updated_at = now()
WHERE public.primecare_normalize_lab_id(ar.lab_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payments AS p
    WHERE public.primecare_normalize_lab_id(p.lab_id)
      = public.primecare_normalize_lab_id(ar.lab_id)
  );

-- Summary (inspect in SQL editor result pane)
SELECT
  count(*)::int AS ar_rows_updated_scope,
  COALESCE(sum(total_paid), 0)::numeric AS sum_total_paid,
  COALESCE(sum(outstanding), 0)::numeric AS sum_outstanding
FROM public.ar_credit_control;
