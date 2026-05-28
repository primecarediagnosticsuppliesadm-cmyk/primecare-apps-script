/**
 * Tenant-scoped operational task lifecycle (local persistence — no schema/RLS changes).
 */

export const TASK_STATES = [
  "OPEN",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "ESCALATED",
  "COMPLETED",
  "REOPENED",
];

const STORAGE_PREFIX = "primecare_operational_tasks_v1";

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

export function loadOperationalTaskRecords(tenantId) {
  return readAll(tenantId);
}

export function getOperationalTaskRecord(tenantId, taskId) {
  return readAll(tenantId)[str(taskId)] || null;
}

function emptyRecord(taskId, tenantId, seed = {}) {
  const now = new Date().toISOString();
  return {
    taskId: str(taskId),
    tenantId: str(tenantId),
    taskType: seed.taskType || "EXECUTIVE_REVIEW",
    severity: seed.severity || "MONITORING",
    linkedInterventionId: seed.linkedInterventionId || "",
    linkedLabId: seed.linkedLabId || "",
    linkedLabName: seed.linkedLabName || "",
    linkedAgentId: seed.linkedAgentId || "",
    linkedAgentName: seed.linkedAgentName || "",
    owner: seed.owner || "",
    assignee: seed.assignee || "",
    dueDate: seed.dueDate || "",
    escalationState: "",
    urgency: seed.urgency || "normal",
    operationalNotes: [],
    resolutionStatus: "OPEN",
    evidenceIds: [],
    source: seed.source || "derived",
    createdAt: now,
    assignedAt: null,
    acknowledgedAt: null,
    completedAt: null,
    reopenedAt: null,
    updatedAt: now,
    history: [],
  };
}

function pushHistory(rec, entry) {
  rec.history = [...(rec.history || []), entry].slice(-40);
}

const ACTION_RULES = {
  assign: { state: "ASSIGNED" },
  reassign: { state: "ASSIGNED" },
  escalate: { state: "ESCALATED" },
  acknowledge: { state: "ACKNOWLEDGED" },
  start: { state: "IN_PROGRESS" },
  request_evidence: { state: "WAITING" },
  require_followup: { state: "WAITING" },
  block: { state: "BLOCKED" },
  complete: { state: "COMPLETED" },
  reopen: { state: "REOPENED" },
  set_urgency: { state: null },
  add_note: { state: null },
};

/**
 * Apply task action; creates record from seed if missing.
 */
export function applyOperationalTaskAction({
  tenantId,
  taskId,
  action,
  actor,
  actorRole = "",
  note = "",
  assignTo = "",
  urgency = "",
  evidenceId = "",
}) {
  const id = str(taskId);
  if (!id) return null;

  const map = readAll(tenantId);
  const rec = map[id] || emptyRecord(id, tenantId);
  const prev = rec.resolutionStatus;
  const rule = ACTION_RULES[action];
  if (!rule) return rec;

  const now = new Date().toISOString();
  const entry = {
    action,
    fromState: prev,
    toState: rule.state || prev,
    actor: str(actor) || "System",
    actorRole: str(actorRole),
    note: str(note),
    at: now,
  };

  if (rule.state) {
    rec.resolutionStatus = rule.state;
    entry.toState = rule.state;
  }

  rec.updatedAt = now;

  if (action === "assign" || action === "reassign") {
    rec.assignee = str(assignTo) || rec.assignee;
    rec.owner = rec.assignee || rec.owner;
    rec.assignedAt = rec.assignedAt || now;
  }
  if (action === "acknowledge") {
    rec.acknowledgedAt = now;
  }
  if (action === "escalate") {
    rec.escalationState = "ESCALATED";
    rec.escalatedBy = str(actor);
  }
  if (action === "request_evidence") {
    rec.escalationState = rec.escalationState || "PROOF_REQUIRED";
  }
  if (action === "set_urgency" && urgency) {
    rec.urgency = urgency;
  }
  if (action === "add_note" && note) {
    rec.operationalNotes = [...(rec.operationalNotes || []), { at: now, actor: str(actor), text: note }].slice(-20);
  }
  if (evidenceId) {
    rec.evidenceIds = [...new Set([...(rec.evidenceIds || []), str(evidenceId)])].slice(-12);
  }
  if (action === "complete") {
    rec.completedAt = now;
    rec.escalationState = "";
  }
  if (action === "reopen") {
    rec.completedAt = null;
    rec.reopenedAt = now;
    rec.resolutionStatus = "REOPENED";
    entry.toState = "REOPENED";
  }

  pushHistory(rec, entry);
  map[id] = rec;
  writeAll(tenantId, map);
  return rec;
}

/**
 * Upsert task shell from derived operational issue (no duplicate intervention store).
 */
export function ensureOperationalTaskRecord(tenantId, taskId, seed) {
  const id = str(taskId);
  const map = readAll(tenantId);
  if (map[id]) return map[id];
  const rec = emptyRecord(id, tenantId, seed);
  map[id] = rec;
  writeAll(tenantId, map);
  return rec;
}

export function taskAgeMs(record) {
  if (!record?.createdAt) return 0;
  return Date.now() - Date.parse(record.createdAt);
}

export function taskCompletionMs(record) {
  if (!record?.completedAt || !record?.createdAt) return null;
  return Date.parse(record.completedAt) - Date.parse(record.createdAt);
}

export function isTaskOverdue(task, now = Date.now()) {
  if (!task?.dueDate || task.resolutionStatus === "COMPLETED") return false;
  const due = Date.parse(String(task.dueDate).slice(0, 10));
  return Number.isFinite(due) && due < now;
}
