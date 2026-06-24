import { formatOpsDate } from "@/operations/operationsCenterAdminEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

export const ACCESS_AUDIT_ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "created", label: "User Created" },
  { value: "password_reset", label: "Password Reset" },
  { value: "deactivated", label: "User Deactivated" },
  { value: "reactivated", label: "User Reactivated" },
  { value: "lab_assigned", label: "Lab Assigned" },
  { value: "lab_unassigned", label: "Lab Unassigned" },
  { value: "lab_transferred", label: "Lab Transferred" },
  { value: "role_changed", label: "Role Changed" },
  { value: "ownership_reassigned", label: "Ownership Reassigned" },
  { value: "ownership_assigned", label: "Ownership Assigned" },
  { value: "ownership_transferred", label: "Ownership Transferred" },
  { value: "ownership_removed", label: "Ownership Removed" },
  { value: "ownership_secondary_added", label: "Secondary Owner Added" },
  { value: "ownership_secondary_removed", label: "Secondary Owner Removed" },
  { value: "distributor_changed", label: "Distributor Changed" },
];

const EVENT_TYPE_LABELS = {
  created: "User Created",
  password_reset: "Password Reset",
  deactivated: "User Deactivated",
  reactivated: "User Reactivated",
  lab_transferred: "Lab Transferred",
  role_changed: "Role Changed",
  ownership_reassigned: "Ownership Reassigned",
  ownership_assigned: "Ownership Assigned",
  ownership_transferred: "Ownership Transferred",
  ownership_removed: "Ownership Removed",
  ownership_secondary_added: "Secondary Owner Added",
  ownership_secondary_removed: "Secondary Owner Removed",
  updated: "Profile Updated",
};

const PAYLOAD_ACTION_LABELS = {
  lab_assigned: "Lab Assigned",
  lab_unassigned: "Lab Unassigned",
  role_changed: "Role Changed",
  ownership_reassigned: "Ownership Reassigned",
  ownership_assigned: "Ownership Assigned",
  ownership_transferred: "Ownership Transferred",
  ownership_removed: "Ownership Removed",
  ownership_secondary_added: "Secondary Owner Added",
  ownership_secondary_removed: "Secondary Owner Removed",
  distributor_changed: "Distributor Changed",
};

const USER_CHANGE_ACTIONS = new Set([
  "created",
  "deactivated",
  "reactivated",
  "role_changed",
  "ownership_reassigned",
  "ownership_assigned",
  "ownership_transferred",
  "ownership_removed",
  "distributor_changed",
]);

const LAB_CHANGE_ACTIONS = new Set([
  "lab_transferred",
  "lab_assigned",
  "lab_unassigned",
  "ownership_reassigned",
  "ownership_assigned",
  "ownership_transferred",
  "ownership_removed",
  "ownership_secondary_added",
  "ownership_secondary_removed",
]);

export function formatOpsDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return str(value).slice(0, 19) || "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function resolveAccessAuditAction(event = {}) {
  const eventType = str(event.eventType ?? event.event_type ?? event.actionKey).toLowerCase();
  if (EVENT_TYPE_LABELS[eventType] && eventType !== "updated") {
    return { key: eventType, label: EVENT_TYPE_LABELS[eventType] };
  }

  const payloadAction = str(event.payload?.action).toLowerCase();
  if (payloadAction && PAYLOAD_ACTION_LABELS[payloadAction]) {
    return { key: payloadAction, label: PAYLOAD_ACTION_LABELS[payloadAction] };
  }
  return {
    key: eventType,
    label: EVENT_TYPE_LABELS[eventType] || eventType.replace(/_/g, " "),
  };
}

function labLookupKey(tenantId, labId) {
  return `${str(tenantId).toLowerCase()}|${str(labId).toLowerCase()}`;
}

function resolveStatus(payload = {}) {
  const raw = str(payload.status).toLowerCase();
  if (raw === "failure" || raw === "failed" || raw === "error") return "Failure";
  if (payload.success === false || payload.ok === false) return "Failure";
  return "Success";
}

function pickReason(payload = {}) {
  return str(payload.reason ?? payload.note ?? payload.auditReason) || "—";
}

function buildPreviousNew(payload = {}, actionKey = "") {
  const previous = {};
  const next = {};

  if (
    actionKey === "lab_transferred" ||
    actionKey === "lab_assigned" ||
    actionKey === "lab_unassigned" ||
    actionKey === "ownership_reassigned" ||
    actionKey === "ownership_assigned" ||
    actionKey === "ownership_transferred" ||
    actionKey === "ownership_removed" ||
    actionKey === "ownership_secondary_added" ||
    actionKey === "ownership_secondary_removed"
  ) {
    if (payload.fromAgentId || payload.fromAgentName || payload.previous?.agentId) {
      previous.agent =
        payload.fromAgentName ||
        payload.previous?.agentName ||
        payload.fromAgentId ||
        payload.previous?.agentId;
    }
    if (payload.toAgentId || payload.toAgentName || payload.next?.agentId) {
      next.agent =
        payload.toAgentName ||
        payload.next?.agentName ||
        payload.toAgentId ||
        payload.next?.agentId;
    }
    if (payload.agentId || payload.agentName) {
      next.agent = payload.agentName || payload.agentId;
    }
    if (payload.labId) next.labId = payload.labId;
    if (payload.labName) next.labName = payload.labName;
    if (payload.slot || payload.next?.slot) next.slot = payload.slot || payload.next?.slot;
  }

  if (actionKey === "role_changed") {
    if (payload.previous?.role || payload.fromRole) previous.role = payload.previous?.role || payload.fromRole;
    if (payload.next?.role || payload.toRole) next.role = payload.next?.role || payload.toRole;
  }

  if (actionKey === "distributor_changed") {
    if (payload.previous?.distributorId || payload.fromDistributorId) {
      previous.distributorId = payload.previous?.distributorId || payload.fromDistributorId;
      previous.distributorName = payload.previous?.distributorName || payload.fromDistributorName;
    }
    if (payload.next?.distributorId || payload.toDistributorId) {
      next.distributorId = payload.next?.distributorId || payload.toDistributorId;
      next.distributorName = payload.next?.distributorName || payload.toDistributorName;
    }
  }

  if (payload.previous && typeof payload.previous === "object") {
    Object.assign(previous, payload.previous);
  }
  if (payload.next && typeof payload.next === "object") {
    Object.assign(next, payload.next);
  }

  return { previous, next };
}

export function enrichAccessAuditEvent(event = {}, context = {}) {
  const userNameById = context.userNameById || new Map();
  const userById = context.userById || new Map();
  const labByKey = context.labByKey || new Map();
  const distributorNameById = context.distributorNameById || new Map();

  const action = resolveAccessAuditAction(event);
  const payload = event.payload || {};
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id);
  const labId = str(payload.labId ?? payload.lab_id);
  const lab = labByKey.get(labLookupKey(labTenantId, labId));

  const subjectUser = userById.get(str(event.subjectUserId)) || {};
  const distributorId =
    str(payload.distributorId) ||
    str(subjectUser.distributorId) ||
    str(lab?.tenantId && lab.tenantId !== context.hqTenantId ? lab.tenantId : "");

  const distributorName =
    str(payload.distributorName) ||
    distributorNameById.get(distributorId) ||
    str(lab?.tenantName) ||
    "—";

  const { previous, next } = buildPreviousNew(payload, action.key);

  return {
    ...event,
    actionKey: action.key,
    actionLabel: action.label,
    timestamp: event.createdAt,
    timestampLabel: formatOpsDateTime(event.createdAt),
    dateLabel: formatOpsDate(event.createdAt),
    performedById: str(event.actorUserId),
    performedByName: userNameById.get(str(event.actorUserId)) || str(event.actorUserId).slice(0, 8) || "—",
    targetUserId: str(event.subjectUserId),
    targetUserName: event.subjectName || userNameById.get(str(event.subjectUserId)) || "—",
    targetLabId: labId || "—",
    targetLabName: str(payload.labName) || str(lab?.labName) || labId || "—",
    distributorId: distributorId || "—",
    distributorName,
    reason: pickReason(payload),
    status: resolveStatus(payload),
    previousValues: previous,
    newValues: next,
    relatedEntities: {
      labTenantId: labTenantId || undefined,
      fromAgentId: str(payload.fromAgentId) || undefined,
      toAgentId: str(payload.toAgentId) || undefined,
      agentId: str(payload.agentId) || undefined,
    },
    rawPayload: payload,
  };
}

export function buildAccessAuditContext(bundle = {}, hqTenantId = "") {
  const directoryUsers = bundle.directoryUsers || [];
  const labAssignments = bundle.labAssignments || [];
  const distributorAssignments = bundle.distributorAssignments || [];

  const userNameById = new Map();
  const userById = new Map();
  for (const user of directoryUsers) {
    const id = str(user.userId);
    if (!id) continue;
    userNameById.set(id, str(user.name || user.displayName));
    userById.set(id, user);
  }

  const labByKey = new Map();
  for (const lab of labAssignments) {
    labByKey.set(labLookupKey(lab.tenantId, lab.labId), lab);
  }

  const distributorNameById = new Map();
  for (const row of distributorAssignments) {
    distributorNameById.set(str(row.distributorId), str(row.distributorName));
  }

  return { userNameById, userById, labByKey, distributorNameById, hqTenantId: str(hqTenantId) };
}

export function enrichAccessAuditEvents(events = [], context = {}) {
  return events.map((ev) => enrichAccessAuditEvent(ev, context));
}

export function filterAccessAuditEvents(events = [], filters = {}) {
  const actionFilter = str(filters.action);
  const userFilter = str(filters.userId);
  const distributorFilter = str(filters.distributorId);
  const labFilter = str(filters.labId).toLowerCase();
  const statusFilter = str(filters.status).toLowerCase();
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  return events.filter((ev) => {
    if (actionFilter && ev.actionKey !== actionFilter) return false;
    if (userFilter && str(ev.targetUserId) !== userFilter) return false;
    if (distributorFilter && str(ev.distributorId) !== distributorFilter) return false;
    if (labFilter) {
      const hay = `${ev.targetLabId} ${ev.targetLabName}`.toLowerCase();
      if (!hay.includes(labFilter)) return false;
    }
    if (statusFilter === "success" && ev.status !== "Success") return false;
    if (statusFilter === "failure" && ev.status !== "Failure") return false;
    const ts = new Date(ev.timestamp || 0);
    if (dateFrom && ts < dateFrom) return false;
    if (dateTo && ts > dateTo) return false;
    return true;
  });
}

export function computeAccessAuditKpis(events = []) {
  const todayStart = startOfToday();
  const todayEvents = events.filter((ev) => {
    const ts = new Date(ev.timestamp || 0);
    return Number.isFinite(ts.getTime()) && ts >= todayStart;
  });

  return {
    eventsToday: todayEvents.length,
    passwordResetsToday: todayEvents.filter((ev) => ev.actionKey === "password_reset").length,
    userChangesToday: todayEvents.filter((ev) => USER_CHANGE_ACTIONS.has(ev.actionKey)).length,
    labTransfersToday: todayEvents.filter((ev) => LAB_CHANGE_ACTIONS.has(ev.actionKey)).length,
  };
}

export function validateAccessAuditIntegrity(events = []) {
  const checks = [];
  const ids = new Set();
  let missingActor = 0;
  const fingerprintCounts = new Map();

  for (const ev of events) {
    if (ids.has(ev.id)) {
      checks.push({
        level: "FAIL",
        code: "duplicate_id",
        message: `Duplicate audit row id: ${ev.id}`,
      });
    }
    ids.add(ev.id);

    if (!str(ev.performedById)) missingActor += 1;

    const fp = `${ev.actionKey}|${ev.targetUserId}|${ev.timestamp}|${JSON.stringify(ev.rawPayload)}`;
    fingerprintCounts.set(fp, (fingerprintCounts.get(fp) || 0) + 1);
  }

  for (const [fp, count] of fingerprintCounts.entries()) {
    if (count > 1) {
      checks.push({
        level: "WARN",
        code: "duplicate_fingerprint",
        message: `Possible duplicate audit entries (${count}x): ${fp.slice(0, 120)}…`,
      });
    }
  }

  if (missingActor > 0) {
    checks.push({
      level: missingActor === events.length ? "FAIL" : "WARN",
      code: "missing_actor",
      message: `${missingActor} event(s) missing actor_user_id`,
    });
  }

  const requiredActions = [
    "created",
    "password_reset",
    "deactivated",
    "reactivated",
    "lab_transferred",
  ];
  const present = new Set(events.map((ev) => ev.actionKey));
  for (const action of requiredActions) {
    if (!present.has(action) && events.length > 0) {
      checks.push({
        level: "WARN",
        code: "action_not_observed",
        message: `No ${action} events in loaded window (limit may truncate history)`,
      });
    }
  }

  const overall =
    checks.some((c) => c.level === "FAIL")
      ? "FAIL"
      : checks.some((c) => c.level === "WARN")
        ? "WARN"
        : "PASS";

  return { overall, checks, missingActor, totalEvents: events.length };
}
