import { resolveAccessAuditAction } from "@/operations/accessAuditEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

export const ACTIVITY_CENTER_MODULE_OPTIONS = [
  { value: "", label: "All modules" },
  { value: "orders", label: "Orders" },
  { value: "collections", label: "Collections" },
  { value: "payments", label: "Payments" },
  { value: "inventory", label: "Inventory" },
  { value: "purchase_orders", label: "Purchase Orders" },
  { value: "provisioning", label: "User Provisioning" },
  { value: "audit", label: "Access Audit" },
  { value: "agent_visits", label: "Visits" },
  { value: "qualification", label: "Qualification" },
  { value: "system", label: "System" },
];

export const ACTIVITY_CENTER_SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
];

function parsePayload(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function mapNotificationEvent(row = {}) {
  const payload = parsePayload(row.payload_json ?? row.payload);
  const eventType = str(row.event_type ?? row.eventType);
  const module = str(row.source_module ?? row.sourceModule) || "system";
  const entity =
    str(payload.orderId ?? payload.order_id) ||
    str(payload.labName ?? payload.lab_name) ||
    str(row.source_id ?? row.sourceId) ||
    str(payload.message).slice(0, 80) ||
    eventType.replace(/_/g, " ");

  return {
    id: `notification:${row.event_id ?? row.id}`,
    source: "notification",
    timestamp: row.created_at ?? row.createdAt,
    eventType,
    eventLabel: eventType.replace(/_/g, " "),
    module,
    entity,
    actor: str(payload.actorName ?? payload.actor ?? row.created_by) || "System",
    status: str(row.status) || "pending",
    severity: str(row.severity).toLowerCase() || "info",
    raw: row,
  };
}

function mapProvisioningEvent(row = {}, userNameById = new Map()) {
  const action = resolveAccessAuditAction(row);
  const payload = row.payload || {};
  const entity =
    str(row.subjectName) ||
    userNameById.get(str(row.subjectUserId)) ||
    str(payload.labName) ||
    str(row.subjectUserId).slice(0, 8) ||
    "User";

  const severity =
    action.key === "deactivated" || action.key === "password_reset"
      ? "high"
      : action.key === "lab_transferred" || action.key === "role_changed"
        ? "medium"
        : "info";

  return {
    id: `provisioning:${row.id}`,
    source: "provisioning",
    timestamp: row.createdAt ?? row.created_at,
    eventType: action.key,
    eventLabel: action.label,
    module: "provisioning",
    entity,
    actor: userNameById.get(str(row.actorUserId)) || str(row.actorUserId).slice(0, 8) || "HQ Admin",
    status: str(payload.status).toLowerCase() === "failure" ? "failure" : "success",
    severity,
    raw: row,
  };
}

function mapInventoryMovement(row = {}) {
  const sku = str(row.sku ?? row.productSku ?? row.product_sku);
  const qty = row.quantity ?? row.qty;
  const movementType = str(row.movementType ?? row.movement_type ?? row.type) || "movement";

  return {
    id: `inventory:${row.id ?? `${sku}-${row.created_at}`}`,
    source: "inventory",
    timestamp: row.created_at ?? row.createdAt,
    eventType: movementType,
    eventLabel: `Inventory ${movementType.replace(/_/g, " ")}`,
    module: "inventory",
    entity: sku ? `${sku}${qty != null ? ` (${qty})` : ""}` : "Stock movement",
    actor: str(row.createdBy ?? row.actor ?? row.user_name) || "System",
    status: "logged",
    severity: movementType.toLowerCase().includes("out") ? "medium" : "info",
    raw: row,
  };
}

function mapPurchaseOrderEvent(row = {}) {
  const poId = str(row.poId ?? row.po_id ?? row.id);
  const status = str(row.status ?? row.poStatus ?? row.po_status) || "open";

  return {
    id: `purchase_order:${poId}-${row.updated_at ?? row.created_at}`,
    source: "purchase_order",
    timestamp: row.updated_at ?? row.created_at ?? row.createdAt,
    eventType: "purchase_order_updated",
    eventLabel: "Purchase order update",
    module: "purchase_orders",
    entity: poId ? `PO ${poId}` : "Purchase order",
    actor: str(row.createdBy ?? row.requestedBy) || "HQ",
    status,
    severity: status.toLowerCase().includes("pending") ? "medium" : "info",
    raw: row,
  };
}

export function mergeActivityCenterEvents(sources = {}) {
  const userNameById = sources.userNameById || new Map();
  const events = [];

  for (const row of sources.notifications || []) {
    events.push(mapNotificationEvent(row));
  }
  for (const row of sources.provisioningEvents || []) {
    events.push(mapProvisioningEvent(row, userNameById));
  }
  for (const row of sources.inventoryMovements || []) {
    events.push(mapInventoryMovement(row));
  }
  for (const row of sources.purchaseOrders || []) {
    events.push(mapPurchaseOrderEvent(row));
  }

  return events.sort((a, b) => {
    const tb = new Date(b.timestamp || 0).getTime();
    const ta = new Date(a.timestamp || 0).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

export function filterActivityCenterEvents(events = [], filters = {}) {
  const severity = str(filters.severity).toLowerCase();
  const module = str(filters.module).toLowerCase();
  const eventType = str(filters.eventType).toLowerCase();
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  const search = str(filters.search).toLowerCase();

  return events.filter((ev) => {
    if (severity && ev.severity !== severity) return false;
    if (module && ev.module !== module) return false;
    if (eventType && ev.eventType !== eventType && ev.eventLabel.toLowerCase() !== eventType) {
      return false;
    }
    const ts = new Date(ev.timestamp || 0);
    if (dateFrom && ts < dateFrom) return false;
    if (dateTo && ts > dateTo) return false;
    if (search) {
      const hay = `${ev.eventLabel} ${ev.entity} ${ev.actor} ${ev.module} ${ev.status}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

export function formatActivityTimestamp(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function uniqueActivityEventTypes(events = []) {
  const set = new Set();
  for (const ev of events) {
    if (ev.eventType) set.add(ev.eventType);
  }
  return Array.from(set).sort();
}

const MODULE_LABELS = {
  orders: "Orders",
  collections: "Collections",
  payments: "Payments",
  inventory: "Inventory",
  purchase_orders: "Purchase Orders",
  provisioning: "User Provisioning",
  audit: "Access Audit",
  agent_visits: "Visits",
  qualification: "Qualification",
  system: "System",
};

export function formatActivityModuleLabel(module) {
  const key = str(module).toLowerCase();
  return MODULE_LABELS[key] || key.replace(/_/g, " ");
}

/** Human-readable one-line sentence for timeline feed rows. */
export function formatActivityTimelineSentence(ev = {}) {
  const actor = str(ev.actor) || "System";
  const entity = str(ev.entity) || "record";
  const label = str(ev.eventLabel) || "Activity recorded";
  const status = str(ev.status).toLowerCase();

  if (status === "failure") {
    return `${actor} attempted ${label.toLowerCase()} for ${entity} — action failed.`;
  }
  if (ev.module === "provisioning") {
    return `${actor} ${label.toLowerCase()} for ${entity}.`;
  }
  if (ev.module === "inventory") {
    return `${label} on ${entity} by ${actor}.`;
  }
  if (ev.module === "purchase_orders") {
    return `${entity} updated — status ${str(ev.status) || "changed"}.`;
  }
  return `${actor}: ${label} — ${entity}.`;
}

export function activityTimelineSeverityClass(severity) {
  const s = str(severity).toLowerCase();
  if (s === "critical" || s === "high") return "border-l-red-500 bg-red-50/40";
  if (s === "medium") return "border-l-amber-500 bg-amber-50/30";
  if (s === "low") return "border-l-blue-400 bg-blue-50/20";
  return "border-l-slate-300 bg-slate-50/50";
}
