-- PrimeCare: inventory_ledger + stock column alignment for lab order deduction.
-- Run in Supabase SQL editor after order_write migration.
-- TEMP anon policies — replace with tenant-scoped RLS before production.
--
-- Stock reads in the portal use v_stock_dashboard → product_id, current_stock (see mapStockDashboardRow).
-- Writes target public.products by default (override in app: VITE_SUPABASE_INVENTORY_TABLE).

-- ---------------------------------------------------------------------------
-- inventory_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type text NOT NULL,
  product_id text NOT NULL,
  product_name text,
  order_id text,
  quantity numeric NOT NULL DEFAULT 0,
  stock_before numeric NOT NULL DEFAULT 0,
  stock_after numeric NOT NULL DEFAULT 0,
  tenant_id text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_order_id ON public.inventory_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_product_id ON public.inventory_ledger (product_id);

ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_anon_inventory_ledger_select" ON public.inventory_ledger;
DROP POLICY IF EXISTS "temp_anon_inventory_ledger_insert" ON public.inventory_ledger;

CREATE POLICY "temp_anon_inventory_ledger_select"
  ON public.inventory_ledger FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_inventory_ledger_insert"
  ON public.inventory_ledger FOR INSERT TO anon WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- products: ensure writable stock columns (only if table exists)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'products'
  ) THEN
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_stock numeric NOT NULL DEFAULT 0';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()';
  END IF;
END $$;

-- Optional (dev): allow anon to read/update products for portal stock deduction.
-- Uncomment if updates fail with RLS; tighten before production.
-- ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "temp_anon_products_select" ON public.products;
-- DROP POLICY IF EXISTS "temp_anon_products_update" ON public.products;
-- CREATE POLICY "temp_anon_products_select" ON public.products FOR SELECT TO anon USING (true);
-- CREATE POLICY "temp_anon_products_update" ON public.products FOR UPDATE TO anon USING (true) WITH CHECK (true);
