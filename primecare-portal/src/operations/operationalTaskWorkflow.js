import { labIdKey } from "@/utils/labId.js";
import {
  TASK_TYPE_LABELS,
  taskTypeFromInterventionIssue,
  taskTypeFromAgentQueue,
  agentPriorityToSeverity,
  interventionTaskId,
  agentQueueTaskId,
} from "@/operations/operationalTaskTypes.js";
import {
  getOperationalTaskRecord,
  isTaskOverdue,
  taskAgeMs,
  taskCompletionMs,
} from "@/operations/operationalTaskStateStore.js";

const SEVERITY_RANK = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };
const STATE_RANK = {
  REOPENED: 0,
  ESCALATED: 1,
  BLOCKED: 2,
  OPEN: 3,
  ASSIGNED: 4,
  IN_PROGRESS: 5,
  WAITING: 6,
  ACKNOWLEDGED: 7,
  COMPLETED: 99,
};

const CLUSTER_GROUP_LABELS = {
  MISSING_PROOF_REQUEST: "Missing visit proofs",
  VISIT_REQUIRED: "Visits required",
  COLLECTION_FOLLOW_UP: "Collection follow-ups",
  QUALIFICATION_REVIEW: "Qualification reviews",
  RISK_ESCALATION: "Risk escalations",
  INVENTORY_VERIFICATION: "Inventory verification",
  ORDER_FULFILLMENT_FOLLOW_UP: "Order fulfillment",
  EXECUTIVE_REVIEW: "Executive reviews",
};

function str(v) {
  return String(v ?? "").trim();
}

function parseAgeDays(ageLabel) {
  const m = str(ageLabel).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function defaultDueDate(daysFromNow = 2) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * Hydrate derived task with persisted lifecycle.
 */
export function hydrateOperationalTask(base, tenantId, records = null) {
  const rec = records?.[base.taskId] || getOperationalTaskRecord(tenantId, base.taskId);
  const resolutionStatus = rec?.resolutionStatus || "OPEN";
  const overdue = isTaskOverdue({ ...base, ...rec, resolutionStatus });
  const ageDays = parseAgeDays(base.ageLabel);

  return {
    ...base,
    ...rec,
    taskId: base.taskId,
    taskTypeLabel: TASK_TYPE_LABELS[base.taskType] || base.taskType,
    resolutionStatus,
    overdue,
    ageDays,
    escalationAge: base.ageLabel || (ageDays > 0 ? `${ageDays}d` : "Today"),
    taskAgeMs: rec ? taskAgeMs(rec) : 0,
    completionMs: rec ? taskCompletionMs(rec) : null,
    displaySeverity:
      resolutionStatus === "ESCALATED" || resolutionStatus === "REOPENED"
        ? "CRITICAL"
        : base.severity,
    hasProof: Boolean(base.evidenceCount > 0 || (rec?.evidenceIds || []).length),
  };
}

export function sortOperationalTasks(items) {
  return [...items].sort((a, b) => {
    const sev =
      (SEVERITY_RANK[a.displaySeverity || a.severity] ?? 9) -
      (SEVERITY_RANK[b.displaySeverity || b.severity] ?? 9);
    if (sev !== 0) return sev;
    const st =
      (STATE_RANK[a.resolutionStatus] ?? 50) - (STATE_RANK[b.resolutionStatus] ?? 50);
    if (st !== 0) return st;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (b.ageDays || 0) - (a.ageDays || 0);
  });
}

export function groupOperationalTasks(items, { minClusterSize = 2 } = {}) {
  const byType = new Map();
  for (const item of items) {
    const key = item.taskType || "EXECUTIVE_REVIEW";
    const list = byType.get(key) || [];
    list.push(item);
    byType.set(key, list);
  }

  const clusters = [];
  const singles = [];

  for (const [taskType, members] of byType) {
    const sorted = sortOperationalTasks(members);
    if (members.length >= minClusterSize) {
      const labs = [...new Set(members.map((m) => m.linkedLabName).filter(Boolean))];
      const agents = [...new Set(members.map((m) => m.assignee || m.linkedAgentName).filter(Boolean))];
      const maxAge = Math.max(...members.map((m) => m.ageDays || 0));
      clusters.push({
        kind: "cluster",
        id: `task-cluster-${taskType}`,
        taskType,
        title: `${CLUSTER_GROUP_LABELS[taskType] || taskType} (${members.length})`,
        count: members.length,
        severity: members.some((m) => (m.displaySeverity || m.severity) === "CRITICAL")
          ? "CRITICAL"
          : members.some((m) => (m.displaySeverity || m.severity) === "ATTENTION")
            ? "ATTENTION"
            : "MONITORING",
        members: sorted,
        labPreview: labs.slice(0, 4),
        agentPreview: agents.slice(0, 3),
        oldestAgeLabel: maxAge > 0 ? `${maxAge}d` : "Today",
        summary: `${members.length} tasks · ${labs.length} labs`,
      });
    } else {
      singles.push(...sorted);
    }
  }

  return {
    clusters: clusters.sort(
      (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
    ),
    singles: sortOperationalTasks(singles),
  };
}

export function filterActiveTasks(items) {
  return items.filter((t) => t.resolutionStatus !== "COMPLETED");
}

export function deriveTaskFromIntervention(issue) {
  const taskId = interventionTaskId(issue.id);
  const taskType = taskTypeFromInterventionIssue(issue);
  return {
    taskId,
    taskType,
    severity: issue.displaySeverity || issue.severity || "MONITORING",
    linkedInterventionId: issue.id,
    linkedLabId: issue.labId || "",
    linkedLabName: issue.labName || issue.subtitle || "",
    linkedAgentName: issue.owner || issue.currentOwner || "",
    owner: issue.currentOwner || issue.owner || "",
    assignee: issue.currentOwner || issue.owner || "",
    dueDate: defaultDueDate(issue.severity === "CRITICAL" ? 1 : 3),
    summary: issue.summary || issue.title,
    title: TASK_TYPE_LABELS[taskType] || issue.title,
    ageLabel: issue.ageLabel || issue.escalationAge || "",
    source: "intervention",
    interventionState: issue.workflowState,
  };
}

export function deriveTaskFromAgentQueue(item, agentMeta = {}) {
  const taskId = agentQueueTaskId(item.id);
  const taskType = taskTypeFromAgentQueue(item.queueType);
  return {
    taskId,
    taskType,
    severity: agentPriorityToSeverity(item.priority),
    linkedInterventionId: "",
    linkedLabId: item.labId || "",
    linkedLabName: item.labName || "",
    linkedAgentId: agentMeta.agentId || "",
    linkedAgentName: agentMeta.agentName || "",
    owner: agentMeta.agentName || "",
    assignee: agentMeta.agentName || "",
    dueDate: item.dueDate && item.dueDate !== "-" ? String(item.dueDate).slice(0, 10) : defaultDueDate(1),
    summary: item.reason || item.nextAction,
    title: TASK_TYPE_LABELS[taskType] || item.nextAction,
    ageLabel: item.daysOverdue > 0 ? `${item.daysOverdue}d` : "Today",
    queueType: item.queueType,
    nextAction: item.nextAction,
    source: "agent_queue",
    outstanding: item.outstanding,
  };
}

/**
 * Build operational timeline for task drawer.
 */
export function buildOperationalTaskTimeline(task, payload = {}) {
  const events = [];
  events.push({
    id: "created",
    at: task.createdAt || new Date().toISOString(),
    label: "Task created",
    detail: task.summary || task.title,
    actor: "System",
    severity: task.severity,
  });

  for (const h of task.history || []) {
    events.push({
      id: `h-${h.at}-${h.action}`,
      at: h.at,
      label: h.action.replaceAll("_", " "),
      detail: `${h.fromState} → ${h.toState}${h.note ? ` · ${h.note}` : ""}`,
      actor: h.actor,
      severity: h.toState === "ESCALATED" ? "CRITICAL" : "MONITORING",
    });
  }

  const lid = labIdKey(task.linkedLabId);
  const evidence = (payload.evidence || []).filter((e) => labIdKey(e.labId) === lid);
  for (const ev of evidence.slice(0, 4)) {
    events.push({
      id: `ev-${ev.evidenceId}`,
      at: ev.uploadedAt,
      label: "Evidence uploaded",
      detail: ev.fileName || ev.kind,
      actor: ev.uploadedBy || "Agent",
      severity: "MONITORING",
    });
  }

  events.sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));
  return events.slice(0, 24);
}

/**
 * Per-agent execution accountability (compact ops metrics).
 */
export function buildExecutionAccountability(tasks) {
  const byAgent = new Map();

  for (const t of tasks) {
    const key = str(t.assignee || t.linkedAgentName || t.owner) || "Unassigned";
    const row = byAgent.get(key) || {
      agent: key,
      assigned: 0,
      overdue: 0,
      escalated: 0,
      completed: 0,
      completionMsSum: 0,
      completionCount: 0,
      proofRequired: 0,
      proofLinked: 0,
    };
    row.assigned += 1;
    if (t.overdue) row.overdue += 1;
    if (t.resolutionStatus === "ESCALATED") row.escalated += 1;
    if (t.resolutionStatus === "COMPLETED") {
      row.completed += 1;
      if (t.completionMs != null) {
        row.completionMsSum += t.completionMs;
        row.completionCount += 1;
      }
    }
    if (t.taskType === "MISSING_PROOF_REQUEST") row.proofRequired += 1;
    if (t.hasProof) row.proofLinked += 1;
    byAgent.set(key, row);
  }

  return [...byAgent.values()]
    .map((r) => ({
      ...r,
      avgCompletionHours:
        r.completionCount > 0
          ? Math.round(r.completionMsSum / r.completionCount / 3600000)
          : null,
      followUpRate:
        r.assigned > 0 ? Math.round((r.completed / r.assigned) * 100) : null,
      proofCompliance:
        r.proofRequired > 0 ? Math.round((r.proofLinked / r.proofRequired) * 100) : null,
    }))
    .sort((a, b) => b.overdue - a.overdue || b.escalated - a.escalated)
    .slice(0, 8);
}

/**
 * Executive governance slice.
 */
export function buildExecutiveResolutionGovernance(tasks) {
  const active = filterActiveTasks(tasks);
  return {
    criticalOpen: active.filter((t) => (t.displaySeverity || t.severity) === "CRITICAL").length,
    escalated: active.filter((t) => t.resolutionStatus === "ESCALATED").length,
    blocked: active.filter((t) => t.resolutionStatus === "BLOCKED").length,
    aging: active.filter((t) => (t.ageDays || 0) >= 14).length,
    reopened: active.filter((t) => t.resolutionStatus === "REOPENED").length,
    staleOwners: active.filter((t) => !str(t.assignee) && !str(t.owner)).length,
    slaBreaches: active.filter((t) => t.overdue).length,
    inactiveOwners: active.filter(
      (t) => str(t.assignee) && t.resolutionStatus === "ASSIGNED" && (t.ageDays || 0) >= 7
    ).length,
  };
}

export { CLUSTER_GROUP_LABELS };
