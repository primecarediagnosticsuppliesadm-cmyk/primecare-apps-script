-- Logistics Phase 2 — courier registry + shipment assignment fields (logistics tables only).

CREATE TABLE IF NOT EXISTS public.logistics_couriers (
  courier_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  vehicle_type text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistics_couriers_tenant_active
  ON public.logistics_couriers (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_logistics_couriers_tenant_name
  ON public.logistics_couriers (tenant_id, name);

ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS courier_id text,
  ADD COLUMN IF NOT EXISTS dispatch_notes text;

CREATE INDEX IF NOT EXISTS idx_order_shipments_courier_id
  ON public.order_shipments (courier_id)
  WHERE courier_id IS NOT NULL;

ALTER TABLE public.logistics_couriers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_couriers_select_by_role ON public.logistics_couriers;
CREATE POLICY logistics_couriers_select_by_role
  ON public.logistics_couriers FOR SELECT TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS logistics_couriers_insert_by_role ON public.logistics_couriers;
CREATE POLICY logistics_couriers_insert_by_role
  ON public.logistics_couriers FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS logistics_couriers_update_by_role ON public.logistics_couriers;
CREATE POLICY logistics_couriers_update_by_role
  ON public.logistics_couriers FOR UPDATE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS logistics_couriers_delete_by_role ON public.logistics_couriers;
CREATE POLICY logistics_couriers_delete_by_role
  ON public.logistics_couriers FOR DELETE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_couriers TO authenticated;

COMMENT ON TABLE public.logistics_couriers IS
  'HQ-managed external courier directory for logistics dispatch (Phase 2).';

COMMENT ON COLUMN public.order_shipments.courier_id IS
  'Optional FK to logistics_couriers for external courier assignments.';

COMMENT ON COLUMN public.order_shipments.dispatch_notes IS
  'Operational dispatch notes (separate from proof-of-delivery delivery_notes).';
