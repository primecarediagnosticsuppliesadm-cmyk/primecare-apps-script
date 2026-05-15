-- PrimeCare Day 3+: order ↔ inventory ↔ AR ↔ dashboard cross-module sync
-- Run in Supabase SQL editor after order_write + inventory_ledger migrations.
-- Idempotent. TEMP anon policies — replace before production.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inventory_updated boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ar_posted boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_notes text;

-- Optional indexes for dashboards / ops
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_lab_id ON public.orders (lab_id);

COMMENT ON COLUMN public.orders.inventory_updated IS 'True once ORDER_OUT inventory deduction ran (ledger or flag). Idempotency.';
COMMENT ON COLUMN public.orders.ar_posted IS 'True once fulfill path increased AR for this order. Idempotency.';
