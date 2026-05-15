-- PrimeCare: Supabase order write migration (run in Supabase SQL editor).
-- TEMPORARY — tighten or remove anon policies before production.
--
-- 1) order_items table (if you already use order_lines only, rename or adjust app code.)
-- 2) RLS + policies for anon insert/select used during local migration testing.

-- Align optional columns used by the portal write path
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;

-- ---------------------------------------------------------------------------
-- order_items (line items; app joins on orders.order_id text)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id text NOT NULL,
  order_id text NOT NULL,
  product_id text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (order_item_id)
);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS created_by text;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (orders + order_items)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Drop prior temp policies if re-running
DROP POLICY IF EXISTS "temp_anon_orders_select" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_insert" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "temp_anon_order_items_insert" ON public.order_items;

-- TEMP: anon can read/write (replace with tenant-scoped policies later)
CREATE POLICY "temp_anon_orders_select"
  ON public.orders FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_orders_insert"
  ON public.orders FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "temp_anon_order_items_select"
  ON public.order_items FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_order_items_insert"
  ON public.order_items FOR INSERT TO anon WITH CHECK (true);

-- Optional: mirror for authenticated role if your client uses JWT sessions
-- CREATE POLICY "temp_authenticated_orders_select" ON public.orders FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "temp_authenticated_orders_insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
