-- PrimeCare: Purchase Orders migration for Supabase create/read/receive flow.
-- Run after inventory_ledger_migration.sql because receipts write PURCHASE_IN rows
-- to public.inventory_ledger using inventory_ledger.order_id = purchase_orders.po_id.
-- TEMP anon policies are for portal migration/dev only; replace with tenant-scoped
-- policies before production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id text NOT NULL UNIQUE,
  po_date date NOT NULL DEFAULT current_date,
  product_id text,
  product_name text,
  quantity numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  supplier text,
  status text NOT NULL DEFAULT 'Draft',
  notes text,
  grn_notes text,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id text NOT NULL REFERENCES public.purchase_orders(po_id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product_name text,
  quantity numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_id ON public.purchase_orders (po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_product_id ON public.purchase_orders (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON public.purchase_order_items (po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON public.purchase_order_items (product_id);

-- Ensure receipt flow can update stock timestamp.
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS current_stock numeric NOT NULL DEFAULT 0;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_anon_purchase_orders_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "temp_anon_purchase_orders_insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "temp_anon_purchase_orders_update" ON public.purchase_orders;
DROP POLICY IF EXISTS "temp_anon_purchase_order_items_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "temp_anon_purchase_order_items_insert" ON public.purchase_order_items;
DROP POLICY IF EXISTS "temp_anon_purchase_order_items_update" ON public.purchase_order_items;

CREATE POLICY "temp_anon_purchase_orders_select"
  ON public.purchase_orders FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_purchase_orders_insert"
  ON public.purchase_orders FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "temp_anon_purchase_orders_update"
  ON public.purchase_orders FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "temp_anon_purchase_order_items_select"
  ON public.purchase_order_items FOR SELECT TO anon USING (true);

CREATE POLICY "temp_anon_purchase_order_items_insert"
  ON public.purchase_order_items FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "temp_anon_purchase_order_items_update"
  ON public.purchase_order_items FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Optional if inventory RLS is enabled in your environment:
-- DROP POLICY IF EXISTS "temp_anon_inventory_select" ON public.inventory;
-- DROP POLICY IF EXISTS "temp_anon_inventory_update" ON public.inventory;
-- CREATE POLICY "temp_anon_inventory_select" ON public.inventory FOR SELECT TO anon USING (true);
-- CREATE POLICY "temp_anon_inventory_update" ON public.inventory FOR UPDATE TO anon USING (true) WITH CHECK (true);
