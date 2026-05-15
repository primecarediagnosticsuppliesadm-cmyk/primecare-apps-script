-- PrimeCare: payments insert + ar_credit_control updates for Collections write path.
-- Run in Supabase SQL editor. TEMP anon policies — replace before production.

-- ---------------------------------------------------------------------------
-- payments (portal collection / receipt rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text NOT NULL,
  tenant_id text,
  order_id text,
  lab_id text NOT NULL,
  amount_received numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT (CURRENT_DATE),
  mode text,
  outstanding_balance numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_lab_id ON public.payments (lab_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments (payment_date);

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS collected_by text;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_anon_payments_select" ON public.payments;
DROP POLICY IF EXISTS "temp_anon_payments_insert" ON public.payments;

CREATE POLICY "temp_anon_payments_select"
  ON public.payments FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_payments_insert"
  ON public.payments FOR INSERT TO anon WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- ar_credit_control: columns used by createPaymentWrite (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ar_credit_control'
  ) THEN
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS total_paid numeric NOT NULL DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS outstanding numeric';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()';
  END IF;
END $$;

ALTER TABLE public.ar_credit_control ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_anon_ar_credit_select" ON public.ar_credit_control;
DROP POLICY IF EXISTS "temp_anon_ar_credit_update" ON public.ar_credit_control;

CREATE POLICY "temp_anon_ar_credit_select"
  ON public.ar_credit_control FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_ar_credit_update"
  ON public.ar_credit_control FOR UPDATE TO anon USING (true) WITH CHECK (true);
