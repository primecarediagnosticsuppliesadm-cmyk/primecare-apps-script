/**
 * Tenant-scoped intervention state (local persistence — no schema/RLS changes).
 */

export const INTERVENTION_STATES = [
  "NEW",
  "ACKNOWLEDGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING",
  "ESCALATED",
  "RESOLVED",
  "REOPENED",
];

const STORAGE_PREFIX = "primecare_executive_interventions_v1";

function str(v) {
  return String(v ?? "").trim();
}

function storageKey(tenantId) {
  return `${STORAGE_PREFIX}:${str(tenantId) || "default"}`;
}

function readAll(tenantId) {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(tenantId, map) {
  try {
    localStorage.setItem(storageKey(tenantId), JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * @returns {Record<string, object>}
 */
export function loadInterventionRecords(tenantId) {
  return readAll(tenantId);
}

export function getInterventionRecord(tenantId, issueId) {
  const map = readAll(tenantId);
  return map[str(issueId)] || null;
}

function emptyRecord(issueId, tenantId) {
  const now = new Date().toISOString();
  return {
    issueId: str(issueId),
    tenantId: str(tenantId),
    state: "NEW",
    currentOwner: "",
    escalationOwner: "",
    pendingActor: "",
    snoozedUntil: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    acknowledgedBy: "",
    escalatedBy: "",
    assignedBy: "",
    resolvedBy: "",
    history: [],
  };
}

const ACTION_TRANSITIONS = {
  assign_owner: { state: "ASSIGNED", field: "currentOwner" },
  escalate: { state: "ESCALATED", field: "escalationOwner" },
  mark_reviewed: { state: "ACKNOWLEDGED", field: "acknowledgedBy" },
  request_followup: { state: "WAITING", pending: "Follow-up requested" },
  require_proof: { state: "IN_PROGRESS", pending: "Proof required" },
  snooze: { state: "WAITING", snoozeHours: 24 },
  resolve: { state: "RESOLVED" },
  reopen: { state: "REOPENED" },
};

/**
 * Deterministic state transition.
 */
export function applyInterventionAction({
  tenantId,
  issueId,
  action,
  actor,
  actorRole = "",
  note = "",
  assignTo = "",
}) {
  const id = str(issueId);
  if (!id) return null;

  const map = readAll(tenantId);
  const rec = map[id] || emptyRecord(id, tenantId);
  const prev = rec.state;
  const rule = ACTION_TRANSITIONS[action];
  if (!rule) return rec;

  const now = new Date().toISOString();
  const entry = {
    action,
    fromState: prev,
    toState: rule.state,
    actor: str(actor) || "Executive",
    actorRole: str(actorRole),
    note: str(note),
    at: now,
  };

  rec.state = rule.state;
  rec.updatedAt = now;

  if (action === "assign_owner") {
    rec.currentOwner = str(assignTo) || str(actor);
    rec.assignedBy = str(actor);
  }
  if (action === "escalate") {
    rec.escalationOwner = str(actor);
    rec.escalatedBy = str(actor);
  }
  if (action === "mark_reviewed") {
    rec.acknowledgedBy = str(actor);
  }
  if (action === "request_followup" || action === "require_proof") {
    rec.pendingActor = rule.pending || str(assignTo) || rec.currentOwner;
  }
  if (action === "snooze") {
    const until = new Date(Date.now() + (rule.snoozeHours || 24) * 3600000);
    rec.snoozedUntil = until.toISOString();
    rec.pendingActor = "Snoozed";
  }
  if (action === "resolve") {
    rec.resolvedAt = now;
    rec.resolvedBy = str(actor);
    rec.pendingActor = "";
    rec.snoozedUntil = null;
  }
  if (action === "reopen") {
    rec.resolvedAt = null;
    rec.resolvedBy = "";
    rec.state = "REOPENED";
    entry.toState = "REOPENED";
  }

  rec.history = [...(rec.history || []), entry].slice(-40);
  map[id] = rec;
  writeAll(tenantId, map);
  return rec;
}

export function isInterventionSnoozed(record) {
  if (!record?.snoozedUntil) return false;
  return Date.parse(record.snoozedUntil) > Date.now();
}

export function interventionAgeMs(record) {
  if (!record?.createdAt) return 0;
  return Date.now() - Date.parse(record.createdAt);
}

export function timeToResolutionMs(record) {
  if (!record?.resolvedAt || !record?.createdAt) return null;
  return Date.parse(record.resolvedAt) - Date.parse(record.createdAt);
}
