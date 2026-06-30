/**
 * Logistics shipment status machine, KPIs, filters — UI/ops layer only.
 */

function str(v) {
  return String(v ?? "").trim();
}

export const SHIPMENT_STATUS = {
  READY: "ready_for_dispatch",
  ASSIGNED: "assigned",
  OUT: "out_for_delivery",
  DELIVERED: "delivered",
  FAILED: "delivery_failed",
  RESCHEDULED: "rescheduled",
  RETURNED: "returned",
};

export const SHIPMENT_STATUS_LABELS = {
  [SHIPMENT_STATUS.READY]: "Ready For Dispatch",
  [SHIPMENT_STATUS.ASSIGNED]: "Assigned",
  [SHIPMENT_STATUS.OUT]: "Out For Delivery",
  [SHIPMENT_STATUS.DELIVERED]: "Delivered",
  [SHIPMENT_STATUS.FAILED]: "Delivery Failed",
  [SHIPMENT_STATUS.RESCHEDULED]: "Rescheduled",
  [SHIPMENT_STATUS.RETURNED]: "Returned",
};

export const DELIVERY_METHOD_OPTIONS = [
  { id: "primecare_delivery", label: "PrimeCare Delivery" },
  { id: "courier", label: "Courier" },
  { id: "customer_pickup", label: "Customer Pickup" },
  { id: "vendor_direct", label: "Vendor Direct Shipment" },
  { id: "distributor_delivery", label: "Distributor Delivery" },
];

export const ASSIGNEE_TYPE_OPTIONS = [
  { id: "agent", label: "Agent" },
  { id: "courier", label: "Courier" },
  { id: "driver", label: "Driver" },
  { id: "vendor", label: "Vendor" },
];

const VALID_TRANSITIONS = {
  [SHIPMENT_STATUS.READY]: [SHIPMENT_STATUS.ASSIGNED],
  [SHIPMENT_STATUS.ASSIGNED]: [SHIPMENT_STATUS.OUT],
  [SHIPMENT_STATUS.OUT]: [SHIPMENT_STATUS.DELIVERED, SHIPMENT_STATUS.FAILED],
  [SHIPMENT_STATUS.FAILED]: [SHIPMENT_STATUS.RESCHEDULED, SHIPMENT_STATUS.RETURNED],
  [SHIPMENT_STATUS.RESCHEDULED]: [
    SHIPMENT_STATUS.ASSIGNED,
    SHIPMENT_STATUS.OUT,
    SHIPMENT_STATUS.DELIVERED,
  ],
  [SHIPMENT_STATUS.DELIVERED]: [],
  [SHIPMENT_STATUS.RETURNED]: [],
};

export function shipmentStatusLabel(status) {
  const key = str(status).toLowerCase();
  return SHIPMENT_STATUS_LABELS[key] || status || "—";
}

export function deliveryMethodLabel(methodId) {
  const id = str(methodId).toLowerCase();
  return DELIVERY_METHOD_OPTIONS.find((o) => o.id === id)?.label || methodId || "—";
}

export function canTransitionShipmentStatus(fromStatus, toStatus) {
  const from = str(fromStatus).toLowerCase();
  const to = str(toStatus).toLowerCase();
  if (!from || !to || from === to) return false;
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function nextShipmentStatusOptions(currentStatus) {
  const from = str(currentStatus).toLowerCase();
  return (VALID_TRANSITIONS[from] || []).map((id) => ({
    id,
    label: shipmentStatusLabel(id),
  }));
}

export function buildShipmentIdForOrder(orderId) {
  const oid = str(orderId);
  if (!oid) return "";
  return `SHP-${oid}`;
}

export function mapShipmentRow(row) {
  if (!row) return null;
  return {
    shipmentId: str(row.shipment_id ?? row.shipmentId),
    tenantId: str(row.tenant_id ?? row.tenantId),
    orderId: str(row.order_id ?? row.orderId),
    labId: str(row.lab_id ?? row.labId),
    labName: str(row.lab_name ?? row.labName),
    labCity: str(row.lab_city ?? row.labCity),
    distributorId: str(row.distributor_id ?? row.distributorId),
    orderValue: Number(row.order_value ?? row.orderValue ?? 0),
    deliveryMethod: str(row.delivery_method ?? row.deliveryMethod),
    dispatchStatus: str(row.dispatch_status ?? row.dispatchStatus) || SHIPMENT_STATUS.READY,
    assignedToType: str(row.assigned_to_type ?? row.assignedToType),
    assignedToId: str(row.assigned_to_id ?? row.assignedToId),
    assignedToName: str(row.assigned_to_name ?? row.assignedToName),
    courierName: str(row.courier_name ?? row.courierName),
    trackingNumber: str(row.tracking_number ?? row.trackingNumber),
    vehicleRef: str(row.vehicle_ref ?? row.vehicleRef),
    dispatchDate: str(row.dispatch_date ?? row.dispatchDate),
    expectedDispatchBy: str(row.expected_dispatch_by ?? row.expectedDispatchBy),
    expectedDeliveryBy: str(row.expected_delivery_by ?? row.expectedDeliveryBy),
    deliveredAt: str(row.delivered_at ?? row.deliveredAt),
    receiverName: str(row.receiver_name ?? row.receiverName),
    receiverPhone: str(row.receiver_phone ?? row.receiverPhone),
    deliveryNotes: str(row.delivery_notes ?? row.deliveryNotes),
    failureReason: str(row.failure_reason ?? row.failureReason),
    rescheduledFor: str(row.rescheduled_for ?? row.rescheduledFor),
    createdBy: str(row.created_by ?? row.createdBy),
    createdAt: str(row.created_at ?? row.createdAt),
    updatedAt: str(row.updated_at ?? row.updatedAt),
  };
}

export function mapShipmentEventRow(row) {
  return {
    eventId: str(row.event_id ?? row.eventId),
    shipmentId: str(row.shipment_id ?? row.shipmentId),
    fromStatus: str(row.from_status ?? row.fromStatus),
    toStatus: str(row.to_status ?? row.toStatus),
    actorId: str(row.actor_id ?? row.actorId),
    notes: str(row.notes),
    createdAt: str(row.created_at ?? row.createdAt),
  };
}

function isToday(isoOrDate) {
  const raw = str(isoOrDate);
  if (!raw) return false;
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function computeLogisticsKpis(shipments = []) {
  const list = Array.isArray(shipments) ? shipments : [];
  let ready = 0;
  let out = 0;
  let deliveredToday = 0;
  let failed = 0;
  let returned = 0;
  let assigned = 0;

  for (const s of list) {
    const status = str(s.dispatchStatus ?? s.dispatch_status).toLowerCase();
    if (status === SHIPMENT_STATUS.READY) ready += 1;
    if (status === SHIPMENT_STATUS.ASSIGNED) assigned += 1;
    if (status === SHIPMENT_STATUS.OUT) out += 1;
    if (status === SHIPMENT_STATUS.FAILED) failed += 1;
    if (status === SHIPMENT_STATUS.RETURNED) returned += 1;
    if (status === SHIPMENT_STATUS.DELIVERED && isToday(s.deliveredAt ?? s.delivered_at)) {
      deliveredToday += 1;
    }
  }

  return {
    readyForDispatch: ready,
    assigned,
    outForDelivery: out,
    deliveredToday,
    failedDeliveries: failed,
    returned,
    total: list.length,
  };
}

export const DISPATCH_QUEUE_FILTERS = [
  { id: "", label: "All" },
  { id: SHIPMENT_STATUS.READY, label: "Ready" },
  { id: SHIPMENT_STATUS.ASSIGNED, label: "Assigned" },
  { id: SHIPMENT_STATUS.OUT, label: "Out For Delivery" },
  { id: SHIPMENT_STATUS.DELIVERED, label: "Delivered" },
  { id: SHIPMENT_STATUS.FAILED, label: "Failed" },
  { id: SHIPMENT_STATUS.RETURNED, label: "Returned" },
  { id: "courier", label: "Courier" },
  { id: "customer_pickup", label: "Customer Pickup" },
];

export function filterShipments(shipments, { statusFilter = "", search = "" } = {}) {
  const q = str(search).toLowerCase();
  const filter = str(statusFilter).toLowerCase();

  return (shipments || []).filter((row) => {
    const status = str(row.dispatchStatus).toLowerCase();
    const method = str(row.deliveryMethod).toLowerCase();

    if (filter === "courier" && method !== "courier") return false;
    if (filter === "customer_pickup" && method !== "customer_pickup") return false;
    if (filter && filter !== "courier" && filter !== "customer_pickup" && status !== filter) {
      return false;
    }

    if (!q) return true;
    return (
      str(row.shipmentId).toLowerCase().includes(q) ||
      str(row.orderId).toLowerCase().includes(q) ||
      str(row.labName).toLowerCase().includes(q) ||
      str(row.labCity).toLowerCase().includes(q) ||
      str(row.assignedToName).toLowerCase().includes(q) ||
      str(row.trackingNumber).toLowerCase().includes(q)
    );
  });
}

export function sortShipmentsByCreatedDesc(shipments) {
  return [...(shipments || [])].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export function buildShipmentTimeline(events = [], currentStatus = "") {
  const steps = [
    SHIPMENT_STATUS.READY,
    SHIPMENT_STATUS.ASSIGNED,
    SHIPMENT_STATUS.OUT,
    SHIPMENT_STATUS.DELIVERED,
  ];
  const status = str(currentStatus).toLowerCase();
  const reached = new Set(
    (events || []).map((e) => str(e.toStatus).toLowerCase()).filter(Boolean)
  );
  reached.add(status);

  if (status === SHIPMENT_STATUS.FAILED || status === SHIPMENT_STATUS.RESCHEDULED) {
    reached.add(SHIPMENT_STATUS.FAILED);
  }
  if (status === SHIPMENT_STATUS.RETURNED) {
    reached.add(SHIPMENT_STATUS.RETURNED);
  }

  const rank = (key) => steps.indexOf(key);

  return steps.map((key, index) => {
    const done = reached.has(key) || rank(status) > index;
    const active = status === key;
    const event = (events || []).find((e) => str(e.toStatus).toLowerCase() === key);
    return {
      key,
      label: shipmentStatusLabel(key),
      done,
      active,
      at: event?.createdAt || null,
    };
  });
}
