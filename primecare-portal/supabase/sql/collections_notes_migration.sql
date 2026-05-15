-- PrimeCare Day 2: Collections notes / follow-up on ar_credit_control
-- Run in Supabase SQL editor. TEMP anon policies — replace before production.
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ar_credit_control'
  ) THEN
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS last_follow_up_date date';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS next_follow_up_date date';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS collections_notes text';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS next_action text';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS payment_status text';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS lab_name text';
    EXECUTE 'ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()';
  END IF;
END $$;

-- Optional note on payment rows (collection receipt notes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments'
  ) THEN
    EXECUTE 'ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS note text';
    EXECUTE 'ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS collected_by text';
  END IF;
END $$;

ALTER TABLE public.ar_credit_control ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_anon_ar_credit_select" ON public.ar_credit_control;
DROP POLICY IF EXISTS "temp_anon_ar_credit_update" ON public.ar_credit_control;

CREATE POLICY "temp_anon_ar_credit_select"
  ON public.ar_credit_control FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_ar_credit_update"
  ON public.ar_credit_control FOR UPDATE TO anon USING (true) WITH CHECK (true);
