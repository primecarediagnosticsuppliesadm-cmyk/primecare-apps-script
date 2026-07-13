-- Logistics Phase 4 — delivery route planning (operational only; no finance changes).

CREATE TABLE IF NOT EXISTS public.logistics_warehouses (
  warehouse_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  warehouse_code text NOT NULL,
  warehouse_name text NOT NULL,
  city text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT logistics_warehouses_code_unique UNIQUE (tenant_id, warehouse_code)
);

CREATE INDEX IF NOT EXISTS idx_logistics_warehouses_tenant_active
  ON public.logistics_warehouses (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  route_code text NOT NULL,
  route_name text NOT NULL,
  warehouse_id text REFERENCES public.logistics_warehouses (warehouse_id),
  delivery_day text NOT NULL DEFAULT 'mon',
  vehicle_type text,
  capacity integer NOT NULL DEFAULT 20,
  active boolean NOT NULL DEFAULT true,
  route_status text NOT NULL DEFAULT 'planning',
  courier_id text,
  planned_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_routes_code_unique UNIQUE (tenant_id, route_code),
  CONSTRAINT delivery_routes_delivery_day_check CHECK (
    delivery_day IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
  ),
  CONSTRAINT delivery_routes_status_check CHECK (
    route_status IN ('planning', 'assigned', 'out_for_delivery', 'completed', 'failed')
  ),
  CONSTRAINT delivery_routes_capacity_positive CHECK (capacity > 0)
);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_tenant_planned
  ON public.delivery_routes (tenant_id, planned_date DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_tenant_status
  ON public.delivery_routes (tenant_id, route_status);

CREATE TABLE IF NOT EXISTS public.delivery_route_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.delivery_routes (id) ON DELETE CASCADE,
  shipment_id text NOT NULL REFERENCES public.order_shipments (shipment_id) ON DELETE CASCADE,
  sequence_number integer NOT NULL DEFAULT 1,
  planned_delivery_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_route_shipments_route_shipment_unique UNIQUE (route_id, shipment_id),
  CONSTRAINT delivery_route_shipments_route_sequence_unique UNIQUE (route_id, sequence_number),
  CONSTRAINT delivery_route_shipments_shipment_unique UNIQUE (shipment_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_route_shipments_route
  ON public.delivery_route_shipments (route_id, sequence_number ASC);

ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS preferred_delivery_day text;

ALTER TABLE public.labs
  DROP CONSTRAINT IF EXISTS labs_preferred_delivery_day_check;

ALTER TABLE public.labs
  ADD CONSTRAINT labs_preferred_delivery_day_check
  CHECK (
    preferred_delivery_day IS NULL
    OR preferred_delivery_day IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
  );

COMMENT ON COLUMN public.labs.preferred_delivery_day IS
  'Lab preferred delivery day for route planning (mon–sun). Operational only.';

COMMENT ON TABLE public.logistics_warehouses IS
  'HQ warehouse registry for route planning (Phase 4 foundation).';

COMMENT ON TABLE public.delivery_routes IS
  'Operational delivery routes — planning, driver assignment, stop sequencing. No finance fields.';

COMMENT ON TABLE public.delivery_route_shipments IS
  'Shipments assigned to a delivery route with stop sequence.';

ALTER TABLE public.logistics_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_warehouses_select_by_role ON public.logistics_warehouses;
CREATE POLICY logistics_warehouses_select_by_role
  ON public.logistics_warehouses FOR SELECT TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS logistics_warehouses_write_by_role ON public.logistics_warehouses;
CREATE POLICY logistics_warehouses_write_by_role
  ON public.logistics_warehouses FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS delivery_routes_select_by_role ON public.delivery_routes;
CREATE POLICY delivery_routes_select_by_role
  ON public.delivery_routes FOR SELECT TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS delivery_routes_write_by_role ON public.delivery_routes;
CREATE POLICY delivery_routes_write_by_role
  ON public.delivery_routes FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS delivery_route_shipments_select_by_role ON public.delivery_route_shipments;
CREATE POLICY delivery_route_shipments_select_by_role
  ON public.delivery_route_shipments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_routes r
      WHERE r.id = delivery_route_shipments.route_id
        AND public.can_write_ops_for_tenant(r.tenant_id)
    )
  );

DROP POLICY IF EXISTS delivery_route_shipments_write_by_role ON public.delivery_route_shipments;
CREATE POLICY delivery_route_shipments_write_by_role
  ON public.delivery_route_shipments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_routes r
      WHERE r.id = delivery_route_shipments.route_id
        AND public.can_write_ops_for_tenant(r.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_routes r
      WHERE r.id = delivery_route_shipments.route_id
        AND public.can_write_ops_for_tenant(r.tenant_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_warehouses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_routes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_route_shipments TO authenticated;
