-- PrimeCare Day 1: lab_id normalization (data hygiene)
-- Run in Supabase SQL editor AFTER reviewing collections_data_hygiene_diagnostics.sql
-- Non-destructive: UPDATEs only (no DELETE). Idempotent — safe to re-run.
--
-- Normalizes lab_id to UPPER(TRIM(lab_id)) on core tables used by the portal.

-- ---------------------------------------------------------------------------
-- Shared helper (matches frontend normalizeLabIdKey / labIdKey)
-- ---------------------------------------------------------------------------
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

COMMENT ON FUNCTION public.primecare_normalize_lab_id(text) IS
  'PrimeCare canonical lab key: UPPER(TRIM). NULL if empty.';

-- ---------------------------------------------------------------------------
-- Normalize lab_id per table (skip if table/column missing)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.payments
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'payments: lab_id normalized';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.orders
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'orders: lab_id normalized';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.order_items
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'order_items: lab_id normalized';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_lines' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.order_lines
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'order_lines: lab_id normalized';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_visits' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.agent_visits
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'agent_visits: lab_id normalized';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ar_credit_control' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.ar_credit_control
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'ar_credit_control: lab_id normalized';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labs' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.labs
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'labs: lab_id normalized';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lab_master' AND column_name = 'lab_id'
  ) THEN
    UPDATE public.lab_master
    SET lab_id = public.primecare_normalize_lab_id(lab_id)
    WHERE lab_id IS NOT NULL
      AND lab_id IS DISTINCT FROM public.primecare_normalize_lab_id(lab_id);
    RAISE NOTICE 'lab_master: lab_id normalized';
  END IF;
END $$;

-- Optional: labs table sometimes uses "id" as business key — only if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labs' AND column_name = 'id'
  ) THEN
    -- Do not change uuid PK; skip unless you store business lab code in labs.id as text (unusual)
    NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes on normalized lab_id (skip if table missing)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'payments') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payments_lab_id_norm ON public.payments (public.primecare_normalize_lab_id(lab_id))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'orders') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_lab_id_norm ON public.orders (public.primecare_normalize_lab_id(lab_id))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'agent_visits') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_visits_lab_id_norm ON public.agent_visits (public.primecare_normalize_lab_id(lab_id))';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Post-run: check for duplicate lab_id after normalization (manual review)
-- SELECT lab_id, count(*) FROM ar_credit_control GROUP BY 1 HAVING count(*) > 1;
-- ---------------------------------------------------------------------------
