-- PrimeCare Day 3: order status updates from Orders Monitor
-- Run in Supabase SQL editor. TEMP anon policies — replace before production.
-- Idempotent — safe to re-run.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_notes text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_anon_orders_select" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_insert" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_update" ON public.orders;

CREATE POLICY "temp_anon_orders_select"
  ON public.orders FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_orders_insert"
  ON public.orders FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "temp_anon_orders_update"
  ON public.orders FOR UPDATE TO anon USING (true) WITH CHECK (true);
