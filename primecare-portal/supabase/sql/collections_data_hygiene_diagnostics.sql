-- PrimeCare Day 1: Collections / lab_id data hygiene diagnostics (read-only)
-- Run BEFORE and AFTER lab_id_normalization_migration.sql + ar_reconcile_from_payments.sql
-- No UPDATE/DELETE in this file — SELECT reports only.

-- Ensure helper exists (no-op if already created by normalization migration)
CREATE OR REPLACE FUNCTION public.primecare_normalize_lab_id(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN NULL
    ELSE upper(btrim(raw))
  END;
$$;

-- =============================================================================
-- 1) Duplicate lab IDs differing only by case (per table)
-- =============================================================================
SELECT 'payments' AS source_table, lab_id AS raw_lab_id, public.primecare_normalize_lab_id(lab_id) AS lab_id_key, count(*)::int AS row_count
FROM public.payments
WHERE lab_id IS NOT NULL AND btrim(lab_id) <> ''
GROUP BY lab_id, public.primecare_normalize_lab_id(lab_id)
HAVING count(DISTINCT lab_id) > 1 OR lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id)
ORDER BY lab_id_key, raw_lab_id;

SELECT 'orders' AS source_table, lab_id AS raw_lab_id, public.primecare_normalize_lab_id(lab_id) AS lab_id_key, count(*)::int AS row_count
FROM public.orders
WHERE lab_id IS NOT NULL AND btrim(lab_id) <> ''
GROUP BY lab_id, public.primecare_normalize_lab_id(lab_id)
HAVING lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id)
ORDER BY lab_id_key, raw_lab_id;

SELECT 'agent_visits' AS source_table, lab_id AS raw_lab_id, public.primecare_normalize_lab_id(lab_id) AS lab_id_key, count(*)::int AS row_count
FROM public.agent_visits
WHERE lab_id IS NOT NULL AND btrim(lab_id) <> ''
GROUP BY lab_id, public.primecare_normalize_lab_id(lab_id)
HAVING lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id)
ORDER BY lab_id_key, raw_lab_id;

SELECT 'ar_credit_control' AS source_table, lab_id AS raw_lab_id, public.primecare_normalize_lab_id(lab_id) AS lab_id_key, count(*)::int AS row_count
FROM public.ar_credit_control
WHERE lab_id IS NOT NULL AND btrim(lab_id) <> ''
GROUP BY lab_id, public.primecare_normalize_lab_id(lab_id)
HAVING lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id)
ORDER BY lab_id_key, raw_lab_id;

-- Collisions: two+ distinct raw values that normalize to the same key
SELECT 'payments_case_collision' AS check_name, public.primecare_normalize_lab_id(lab_id) AS lab_id_key,
  count(DISTINCT lab_id)::int AS distinct_raw_values,
  count(*)::int AS total_rows
FROM public.payments
WHERE lab_id IS NOT NULL AND btrim(lab_id) <> ''
GROUP BY public.primecare_normalize_lab_id(lab_id)
HAVING count(DISTINCT lab_id) > 1;

-- AR duplicate keys after normalization (would block safe AR updates)
SELECT 'ar_duplicate_lab_id_keys' AS check_name, public.primecare_normalize_lab_id(lab_id) AS lab_id_key, count(*)::int AS ar_rows
FROM public.ar_credit_control
WHERE lab_id IS NOT NULL
GROUP BY public.primecare_normalize_lab_id(lab_id)
HAVING count(*) > 1;

-- =============================================================================
-- 2) Payments not matching AR (by normalized lab_id)
-- =============================================================================
SELECT
  'payments_without_ar_row' AS issue,
  public.primecare_normalize_lab_id(p.lab_id) AS lab_id_key,
  count(*)::int AS payment_count,
  COALESCE(sum(p.amount_received), 0)::numeric AS sum_amount_received
FROM public.payments p
WHERE p.lab_id IS NOT NULL AND btrim(p.lab_id) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.ar_credit_control ar
    WHERE public.primecare_normalize_lab_id(ar.lab_id) = public.primecare_normalize_lab_id(p.lab_id)
  )
GROUP BY public.primecare_normalize_lab_id(p.lab_id)
ORDER BY sum_amount_received DESC;

SELECT
  'ar_without_payments' AS issue,
  public.primecare_normalize_lab_id(ar.lab_id) AS lab_id_key,
  ar.total_paid AS ar_total_paid,
  ar.outstanding AS ar_outstanding
FROM public.ar_credit_control ar
WHERE ar.lab_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE public.primecare_normalize_lab_id(p.lab_id) = public.primecare_normalize_lab_id(ar.lab_id)
  )
ORDER BY ar.outstanding DESC NULLS LAST;

SELECT
  'ar_total_paid_vs_payments_mismatch' AS issue,
  public.primecare_normalize_lab_id(ar.lab_id) AS lab_id_key,
  COALESCE(ar.total_paid, 0)::numeric AS ar_total_paid,
  COALESCE(pay.sum_paid, 0)::numeric AS payments_sum,
  (COALESCE(ar.total_paid, 0) - COALESCE(pay.sum_paid, 0))::numeric AS delta
FROM public.ar_credit_control ar
LEFT JOIN (
  SELECT public.primecare_normalize_lab_id(lab_id) AS lab_id_key, sum(amount_received)::numeric AS sum_paid
  FROM public.payments
  WHERE lab_id IS NOT NULL AND btrim(lab_id) <> ''
  GROUP BY 1
) pay ON pay.lab_id_key = public.primecare_normalize_lab_id(ar.lab_id)
WHERE ar.lab_id IS NOT NULL
  AND abs(COALESCE(ar.total_paid, 0) - COALESCE(pay.sum_paid, 0)) > 0.01
ORDER BY abs(COALESCE(ar.total_paid, 0) - COALESCE(pay.sum_paid, 0)) DESC;

-- =============================================================================
-- 3) Orders not matching labs / AR
-- =============================================================================
SELECT
  'orders_lab_id_not_in_labs' AS issue,
  public.primecare_normalize_lab_id(o.lab_id) AS lab_id_key,
  count(*)::int AS order_count
FROM public.orders o
WHERE o.lab_id IS NOT NULL AND btrim(o.lab_id) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.labs l
    WHERE public.primecare_normalize_lab_id(l.lab_id) = public.primecare_normalize_lab_id(o.lab_id)
  )
GROUP BY public.primecare_normalize_lab_id(o.lab_id)
ORDER BY order_count DESC;

SELECT
  'orders_lab_id_not_in_ar' AS issue,
  public.primecare_normalize_lab_id(o.lab_id) AS lab_id_key,
  count(*)::int AS order_count,
  COALESCE(sum(o.total_amount), 0)::numeric AS sum_order_amount
FROM public.orders o
WHERE o.lab_id IS NOT NULL AND btrim(o.lab_id) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.ar_credit_control ar
    WHERE public.primecare_normalize_lab_id(ar.lab_id) = public.primecare_normalize_lab_id(o.lab_id)
  )
GROUP BY public.primecare_normalize_lab_id(o.lab_id)
ORDER BY sum_order_amount DESC;

-- Orders with lab_id needing normalization (pre-migration)
SELECT
  'orders_need_lab_id_trim_upper' AS issue,
  count(*)::int AS row_count
FROM public.orders
WHERE lab_id IS NOT NULL
  AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);

-- =============================================================================
-- 4) Post-reconcile sanity (run after ar_reconcile_from_payments.sql)
-- =============================================================================
SELECT
  'post_reconcile_paid_status_check' AS check_name,
  count(*) FILTER (WHERE COALESCE(total_paid, 0) > 0 AND COALESCE(outstanding, 0) <= 0)::int AS paid_current_labs,
  count(*) FILTER (WHERE COALESCE(outstanding, 0) > 0 AND COALESCE(total_paid, 0) <= 0)::int AS pending_no_payments_recorded,
  count(*) FILTER (WHERE COALESCE(total_paid, 0) > 0 AND COALESCE(outstanding, 0) > 0)::int AS partially_paid
FROM public.ar_credit_control;
