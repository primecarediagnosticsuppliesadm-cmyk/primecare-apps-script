-- Logistics Phase 3A — delivery charge policy + operational snapshots (no finance changes).

CREATE TABLE IF NOT EXISTS public.tenant_delivery_policy (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  standard_delivery_charge numeric(12, 2) NOT NULL DEFAULT 150,
  free_delivery_threshold numeric(12, 2) NOT NULL DEFAULT 5000,
  currency text NOT NULL DEFAULT 'INR',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_delivery_policy_standard_nonneg CHECK (standard_delivery_charge >= 0),
  CONSTRAINT tenant_delivery_policy_threshold_nonneg CHECK (free_delivery_threshold >= 0)
);

COMMENT ON TABLE public.tenant_delivery_policy IS
  'HQ distributor delivery charge policy (Phase 3A operational; not wired to invoice/AR yet).';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merchandise_subtotal numeric(12, 2),
  ADD COLUMN IF NOT EXISTS delivery_charge_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_charge_reason text,
  ADD COLUMN IF NOT EXISTS delivery_method_intent text,
  ADD COLUMN IF NOT EXISTS delivery_policy_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS delivery_charge_status text,
  ADD COLUMN IF NOT EXISTS delivery_charge_override_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS delivery_charge_override_reason text,
  ADD COLUMN IF NOT EXISTS delivery_charge_override_by text,
  ADD COLUMN IF NOT EXISTS delivery_charge_override_at timestamptz;

ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS delivery_charge_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_charge_reason text;

COMMENT ON COLUMN public.orders.merchandise_subtotal IS
  'Sum of product line items at order time (excludes delivery charge).';
COMMENT ON COLUMN public.orders.delivery_charge_amount IS
  'Operational delivery charge quote — not included in orders.total_amount in Phase 3A.';
COMMENT ON COLUMN public.order_shipments.delivery_charge_amount IS
  'Operational mirror of orders.delivery_charge_amount at shipment create / sync.';

ALTER TABLE public.tenant_delivery_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_delivery_policy_select_by_role ON public.tenant_delivery_policy;
CREATE POLICY tenant_delivery_policy_select_by_role
  ON public.tenant_delivery_policy FOR SELECT TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_delivery_policy_insert_by_role ON public.tenant_delivery_policy;
CREATE POLICY tenant_delivery_policy_insert_by_role
  ON public.tenant_delivery_policy FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_delivery_policy_update_by_role ON public.tenant_delivery_policy;
CREATE POLICY tenant_delivery_policy_update_by_role
  ON public.tenant_delivery_policy FOR UPDATE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE ON public.tenant_delivery_policy TO authenticated;
