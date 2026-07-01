/**
 * Delivery route planning — operational only (Phase 4). No finance side effects.
 */

function str(v) {
  return String(v ?? "").trim();
}

export const DELIVERY_DAY = {
  MON: "mon",
  TUE: "tue",
  WED: "wed",
  THU: "thu",
  FRI: "fri",
  SAT: "sat",
  SUN: "sun",
};

export const DELIVERY_DAY_LABELS = {
  [DELIVERY_DAY.MON]: "Monday",
  [DELIVERY_DAY.TUE]: "Tuesday",
  [DELIVERY_DAY.WED]: "Wednesday",
  [DELIVERY_DAY.THU]: "Thursday",
  [DELIVERY_DAY.FRI]: "Friday",
  [DELIVERY_DAY.SAT]: "Saturday",
  [DELIVERY_DAY.SUN]: "Sunday",
};

export const DELIVERY_DAY_OPTIONS = Object.values(DELIVERY_DAY).map((value) => ({
  value,
  label: DELIVERY_DAY_LABELS[value],
}));

export const ROUTE_STATUS = {
  PLANNING: "planning",
  ASSIGNED: "assigned",
  OUT: "out_for_delivery",
  COMPLETED: "completed",
  FAILED: "failed",
};

export const ROUTE_STATUS_LABELS = {
  [ROUTE_STATUS.PLANNING]: "Delivery Planning",
  [ROUTE_STATUS.ASSIGNED]: "Assigned Route",
  [ROUTE_STATUS.OUT]: "Out For Delivery",
  [ROUTE_STATUS.COMPLETED]: "Completed",
  [ROUTE_STATUS.FAILED]: "Failed",
};

export function deliveryDayLabel(day) {
  const key = str(day).toLowerCase();
  return DELIVERY_DAY_LABELS[key] || day || "—";
}

export function routeStatusLabel(status) {
  const key = str(status).toLowerCase();
  return ROUTE_STATUS_LABELS[key] || status || "—";
}

export function normalizeDeliveryDay(value) {
  const key = str(value).toLowerCase();
  return Object.values(DELIVERY_DAY).includes(key) ? key : "";
}

export function buildRouteCode(prefix = "RT") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function buildWarehouseId(prefix = "WH") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function mapWarehouseRow(row) {
  if (!row) return null;
  return {
    warehouseId: str(row.warehouse_id ?? row.warehouseId),
    tenantId: str(row.tenant_id ?? row.tenantId),
    warehouseCode: str(row.warehouse_code ?? row.warehouseCode),
    warehouseName: str(row.warehouse_name ?? row.warehouseName),
    city: str(row.city),
    isActive: row.is_active ?? row.isActive ?? true,
    notes: str(row.notes),
    createdAt: str(row.created_at ?? row.createdAt),
    updatedAt: str(row.updated_at ?? row.updatedAt),
  };
}

export function mapRouteRow(row) {
  if (!row) return null;
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id ?? row.tenantId),
    routeCode: str(row.route_code ?? row.routeCode),
    routeName: str(row.route_name ?? row.routeName),
    warehouseId: str(row.warehouse_id ?? row.warehouseId),
    deliveryDay: normalizeDeliveryDay(row.delivery_day ?? row.deliveryDay) || DELIVERY_DAY.MON,
    vehicleType: str(row.vehicle_type ?? row.vehicleType),
    capacity: Number(row.capacity ?? 20),
    active: row.active !== false,
    routeStatus: str(row.route_status ?? row.routeStatus) || ROUTE_STATUS.PLANNING,
    courierId: str(row.courier_id ?? row.courierId),
    plannedDate: str(row.planned_date ?? row.plannedDate),
    createdBy: str(row.created_by ?? row.createdBy),
    completedAt: str(row.completed_at ?? row.completedAt),
    createdAt: str(row.created_at ?? row.createdAt),
    updatedAt: str(row.updated_at ?? row.updatedAt),
  };
}

export function mapRouteStopRow(row) {
  if (!row) return null;
  return {
    id: str(row.id),
    routeId: str(row.route_id ?? row.routeId),
    shipmentId: str(row.shipment_id ?? row.shipmentId),
    sequenceNumber: Number(row.sequence_number ?? row.sequenceNumber ?? 1),
    plannedDeliveryTime: str(row.planned_delivery_time ?? row.plannedDeliveryTime),
    createdAt: str(row.created_at ?? row.createdAt),
    shipment: row.shipment ? mapRouteStopShipment(row.shipment) : null,
  };
}

function mapRouteStopShipment(row) {
  return {
    shipmentId: str(row.shipment_id ?? row.shipmentId),
    orderId: str(row.order_id ?? row.orderId),
    labId: str(row.lab_id ?? row.labId),
    labName: str(row.lab_name ?? row.labName),
    labCity: str(row.lab_city ?? row.labCity),
    dispatchStatus: str(row.dispatch_status ?? row.dispatchStatus),
    expectedDeliveryBy: str(row.expected_delivery_by ?? row.expectedDeliveryBy),
  };
}

export function validateRouteForm({ routeName, capacity } = {}) {
  if (!str(routeName)) return { valid: false, error: "Route name is required" };
  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) {
    return { valid: false, error: "Capacity must be greater than zero" };
  }
  return { valid: true, error: null };
}

function isToday(isoOrDate) {
  const raw = str(isoOrDate);
  if (!raw) return false;
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function computeRoutePlanningKpis(routes = [], routeStopsByRouteId = new Map()) {
  const list = Array.isArray(routes) ? routes : [];
  const today = todayIsoDate();
  let routesToday = 0;
  let vehiclesOut = 0;
  let plannedDeliveries = 0;
  let completedRoutes = 0;
  let failedRoutes = 0;
  let totalStops = 0;
  let activeRouteCount = 0;

  for (const route of list) {
    const planned = str(route.plannedDate ?? route.planned_date);
    const status = str(route.routeStatus ?? route.route_status).toLowerCase();
    const stops = routeStopsByRouteId.get(route.id) || route.stops || [];
    const stopCount = Array.isArray(stops) ? stops.length : 0;

    if (planned === today && route.active !== false) routesToday += 1;
    if (status === ROUTE_STATUS.OUT) vehiclesOut += 1;
    if (planned === today) plannedDeliveries += stopCount;
    if (status === ROUTE_STATUS.COMPLETED && isToday(route.completedAt ?? route.completed_at)) {
      completedRoutes += 1;
    }
    if (status === ROUTE_STATUS.FAILED) failedRoutes += 1;

    if (planned === today && status !== ROUTE_STATUS.COMPLETED) {
      totalStops += stopCount;
      activeRouteCount += 1;
    }
  }

  return {
    routesToday,
    vehiclesOut,
    averageStops: activeRouteCount ? Math.round((totalStops / activeRouteCount) * 10) / 10 : 0,
    plannedDeliveries,
    completedRoutes,
    failedRoutes,
  };
}

export function groupShipmentsByPreferredDay(shipments = [], labPreferredDays = new Map()) {
  const buckets = Object.fromEntries(Object.values(DELIVERY_DAY).map((d) => [d, []]));
  buckets.unassigned = [];

  for (const shipment of shipments || []) {
    const labId = str(shipment.labId ?? shipment.lab_id);
    const day = normalizeDeliveryDay(labPreferredDays.get(labId));
    if (day && buckets[day]) buckets[day].push(shipment);
    else buckets.unassigned.push(shipment);
  }

  return buckets;
}

export function formatDeliveryWindow(stop) {
  const planned = str(stop?.plannedDeliveryTime ?? stop?.planned_delivery_time);
  if (planned) {
    const d = new Date(planned);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  const expected = str(stop?.shipment?.expectedDeliveryBy ?? stop?.expectedDeliveryBy);
  if (expected) return `${expected} (date)`;
  return "—";
}

/** Future foundation — not implemented in Phase 4. */
export const ROUTE_PLANNING_FUTURE = [
  "GPS tracking",
  "Maps integration",
  "Driver mobile app",
  "Proof of delivery capture",
  "Live vehicle tracking",
  "Distance-based stop optimization",
];
