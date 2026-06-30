-- Logistics Phase 1A — operational shipments (additive; no finance table changes).

CREATE TABLE IF NOT EXISTS public.order_shipments (
  shipment_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id text NOT NULL,
  lab_id text,
  lab_name text,
  lab_city text,
  distributor_id text,
  order_value numeric(14, 2) NOT NULL DEFAULT 0,
  delivery_method text,
  dispatch_status text NOT NULL DEFAULT 'ready_for_dispatch',
  assigned_to_type text,
  assigned_to_id text,
  assigned_to_name text,
  courier_name text,
  tracking_number text,
  vehicle_ref text,
  dispatch_date date,
  expected_dispatch_by date,
  expected_delivery_by date,
  delivered_at timestamptz,
  receiver_name text,
  receiver_phone text,
  delivery_notes text,
  failure_reason text,
  rescheduled_for date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_shipments_dispatch_status_check CHECK (
    dispatch_status IN (
      'ready_for_dispatch',
      'assigned',
      'out_for_delivery',
      'delivered',
      'delivery_failed',
      'rescheduled',
      'returned'
    )
  ),
  CONSTRAINT order_shipments_one_per_order UNIQUE (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_shipments_tenant_status
  ON public.order_shipments (tenant_id, dispatch_status);

CREATE INDEX IF NOT EXISTS idx_order_shipments_tenant_created
  ON public.order_shipments (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_shipments_order_id
  ON public.order_shipments (order_id);

CREATE TABLE IF NOT EXISTS public.shipment_status_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id text NOT NULL REFERENCES public.order_shipments (shipment_id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_status_events_shipment
  ON public.shipment_status_events (shipment_id, created_at ASC);

ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_shipments_select_by_role ON public.order_shipments;
CREATE POLICY order_shipments_select_by_role
  ON public.order_shipments FOR SELECT TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.tenant_id_matches(tenant_id)
      AND lower(COALESCE(assigned_to_type, '')) = 'agent'
      AND lower(COALESCE(assigned_to_id, '')) = lower(COALESCE(public.current_profile_agent_id(), ''))
    )
  );

DROP POLICY IF EXISTS order_shipments_write_by_role ON public.order_shipments;
CREATE POLICY order_shipments_write_by_role
  ON public.order_shipments FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS order_shipments_update_by_role ON public.order_shipments;
CREATE POLICY order_shipments_update_by_role
  ON public.order_shipments FOR UPDATE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS order_shipments_delete_by_role ON public.order_shipments;
CREATE POLICY order_shipments_delete_by_role
  ON public.order_shipments FOR DELETE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS shipment_status_events_select_by_role ON public.shipment_status_events;
CREATE POLICY shipment_status_events_select_by_role
  ON public.shipment_status_events FOR SELECT TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.order_shipments s
      WHERE s.shipment_id = shipment_status_events.shipment_id
        AND public.current_user_role() = 'agent'
        AND public.tenant_id_matches(s.tenant_id)
        AND lower(COALESCE(s.assigned_to_type, '')) = 'agent'
        AND lower(COALESCE(s.assigned_to_id, '')) = lower(COALESCE(public.current_profile_agent_id(), ''))
    )
  );

DROP POLICY IF EXISTS shipment_status_events_insert_by_role ON public.shipment_status_events;
CREATE POLICY shipment_status_events_insert_by_role
  ON public.shipment_status_events FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_shipments TO authenticated;
GRANT SELECT, INSERT ON public.shipment_status_events TO authenticated;

COMMENT ON TABLE public.order_shipments IS
  'Operational delivery tracking per fulfilled order; does not replace orders financial lifecycle.';

COMMENT ON TABLE public.shipment_status_events IS
  'Audit timeline for shipment dispatch status transitions.';
