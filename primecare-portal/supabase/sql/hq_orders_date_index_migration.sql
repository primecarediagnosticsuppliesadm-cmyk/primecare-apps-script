-- HQ performance: date-ordered order list reads.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_order_date
  ON public.orders (tenant_id, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_payment_date
  ON public.payments (tenant_id, payment_date DESC);
