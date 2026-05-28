import { labIdKey } from "@/utils/labId.js";
import {
  loadOperationalTaskRecords,
  ensureOperationalTaskRecord,
  applyOperationalTaskAction,
} from "@/operations/operationalTaskStateStore.js";
import { interventionTaskId } from "@/operations/operationalTaskTypes.js";
import {
  deriveTaskFromIntervention,
  deriveTaskFromAgentQueue,
  hydrateOperationalTask,
  sortOperationalTasks,
  groupOperationalTasks,
  filterActiveTasks,
  buildExecutionAccountability,
  buildExecutiveResolutionGovernance,
} from "@/operations/operationalTaskWorkflow.js";

function str(v) {
  return String(v ?? "").trim();
}

function evidenceCountForLab(payload, labId) {
  const lid = labIdKey(labId);
  if (!lid) return 0;
  return (payload?.evidence || []).filter((e) => labIdKey(e.labId) === lid).length;
}

/**
 * Build operational tasks from intervention issues (links 1:1, no duplicate intervention logic).
 */
export function buildTasksFromInterventions(interventionIssues, tenantId, payload = {}) {
  const records = loadOperationalTaskRecords(tenantId);
  const bases = (interventionIssues || []).map((issue) => {
    const base = deriveTaskFromIntervention(issue);
    ensureOperationalTaskRecord(tenantId, base.taskId, {
      taskType: base.taskType,
      severity: base.severity,
      linkedInterventionId: base.linkedInterventionId,
      linkedLabId: base.linkedLabId,
      linkedLabName: base.linkedLabName,
      linkedAgentName: base.linkedAgentName,
      owner: base.owner,
      assignee: base.assignee,
      dueDate: base.dueDate,
      source: "intervention",
    });
    return hydrateOperationalTask(
      { ...base, evidenceCount: evidenceCountForLab(payload, base.linkedLabId) },
      tenantId,
      records
    );
  });
  return bases;
}

/**
 * Build agent-scoped tasks from daily action queue + executive-assigned tasks in store.
 */
export function buildTasksFromAgentQueue(workspace, tenantId, agentMeta = {}, payload = {}) {
  const records = loadOperationalTaskRecords(tenantId);
  const agentName = str(agentMeta.agentName).toLowerCase();
  const agentId = str(agentMeta.agentId);

  const fromQueue = (workspace?.actionQueue || []).map((item) => {
    const base = deriveTaskFromAgentQueue(item, agentMeta);
    ensureOperationalTaskRecord(tenantId, base.taskId, {
      taskType: base.taskType,
      severity: base.severity,
      linkedLabId: base.linkedLabId,
      linkedLabName: base.linkedLabName,
      linkedAgentId: base.linkedAgentId,
      linkedAgentName: base.linkedAgentName,
      owner: base.owner,
      assignee: base.assignee,
      dueDate: base.dueDate,
      source: "agent_queue",
    });
    return hydrateOperationalTask(
      { ...base, evidenceCount: evidenceCountForLab(payload, base.linkedLabId) },
      tenantId,
      records
    );
  });

  const assignedFromStore = Object.values(records)
    .filter((rec) => {
      if (rec.resolutionStatus === "COMPLETED") return false;
      const assignee = str(rec.assignee).toLowerCase();
      const owner = str(rec.owner).toLowerCase();
      const linked = str(rec.linkedAgentName).toLowerCase();
      if (!agentName && !agentId) return false;
      return (
        (agentName && (assignee === agentName || owner === agentName || linked === agentName)) ||
        (agentId && rec.linkedAgentId === agentId)
      );
    })
    .map((rec) =>
      hydrateOperationalTask(
        {
          taskId: rec.taskId,
          taskType: rec.taskType,
          severity: rec.severity,
          linkedInterventionId: rec.linkedInterventionId,
          linkedLabId: rec.linkedLabId,
          linkedLabName: rec.linkedLabName,
          linkedAgentName: rec.linkedAgentName,
          owner: rec.owner,
          assignee: rec.assignee,
          title: rec.taskType,
          summary: rec.operationalNotes?.[rec.operationalNotes.length - 1]?.text || "Assigned task",
          ageLabel: "",
          source: "executive_assigned",
          evidenceCount: evidenceCountForLab(payload, rec.linkedLabId),
        },
        tenantId,
        records
      )
    );

  const seen = new Set();
  const merged = [];
  for (const t of [...assignedFromStore, ...fromQueue]) {
    if (seen.has(t.taskId)) continue;
    seen.add(t.taskId);
    merged.push(t);
  }
  return merged;
}

/**
 * Full operational task model for executive workspace.
 */
export function buildExecutiveOperationalTaskModel(interventionQueues, tenantId, payload = {}) {
  const allIssues = interventionQueues?.allIssues || [
    ...(interventionQueues?.founderActive || []),
    ...(interventionQueues?.clusters || []).flatMap((c) => c.members),
    ...(interventionQueues?.singles || []),
  ];

  const deduped = [];
  const seen = new Set();
  for (const issue of allIssues) {
    if (!issue?.id || seen.has(issue.id)) continue;
    seen.add(issue.id);
    deduped.push(issue);
  }

  const allTasks = buildTasksFromInterventions(deduped, tenantId, payload);
  const active = filterActiveTasks(allTasks);
  const sorted = sortOperationalTasks(active);
  const { clusters, singles } = groupOperationalTasks(sorted);

  const todayYmd = new Date().toISOString().slice(0, 10);
  const todayTasks = active.filter((t) => str(t.dueDate).slice(0, 10) <= todayYmd);
  const overdueTasks = active.filter((t) => t.overdue);
  const escalationTasks = active.filter(
    (t) => t.resolutionStatus === "ESCALATED" || t.resolutionStatus === "REOPENED"
  );
  const proofTasks = active.filter((t) => t.taskType === "MISSING_PROOF_REQUEST");

  return {
    allTasks,
    active,
    clusters,
    singles,
    governance: buildExecutiveResolutionGovernance(allTasks),
    accountability: buildExecutionAccountability(allTasks),
    queues: {
      today: sortOperationalTasks(todayTasks).slice(0, 12),
      overdue: sortOperationalTasks(overdueTasks).slice(0, 12),
      escalations: sortOperationalTasks(escalationTasks).slice(0, 10),
      proofRequired: sortOperationalTasks(proofTasks).slice(0, 10),
      collections: sortOperationalTasks(
        active.filter((t) => t.taskType === "COLLECTION_FOLLOW_UP")
      ).slice(0, 10),
      qualifications: sortOperationalTasks(
        active.filter((t) => t.taskType === "QUALIFICATION_REVIEW")
      ).slice(0, 8),
    },
    resolvedCount: allTasks.filter((t) => t.resolutionStatus === "COMPLETED").length,
  };
}

/**
 * Agent operational execution model.
 */
export function buildAgentOperationalTaskModel(workspace, tenantId, agentMeta, payload = {}) {
  const allTasks = buildTasksFromAgentQueue(workspace, tenantId, agentMeta, payload);
  const active = filterActiveTasks(allTasks);
  const sorted = sortOperationalTasks(active);
  const { clusters, singles } = groupOperationalTasks(sorted);

  const todayYmd = new Date().toISOString().slice(0, 10);
  const todayTasks = active.filter((t) => !t.dueDate || str(t.dueDate).slice(0, 10) <= todayYmd);

  return {
    allTasks,
    active,
    clusters,
    singles,
    queues: {
      today: sortOperationalTasks(todayTasks).slice(0, 10),
      overdue: sortOperationalTasks(active.filter((t) => t.overdue)).slice(0, 8),
      escalations: sortOperationalTasks(
        active.filter((t) => t.resolutionStatus === "ESCALATED")
      ).slice(0, 6),
      proofRequired: sortOperationalTasks(
        active.filter((t) => t.taskType === "MISSING_PROOF_REQUEST")
      ).slice(0, 6),
      collections: sortOperationalTasks(
        active.filter((t) => t.taskType === "COLLECTION_FOLLOW_UP")
      ).slice(0, 8),
      qualifications: sortOperationalTasks(
        active.filter((t) => t.taskType === "QUALIFICATION_REVIEW")
      ).slice(0, 5),
    },
    performance: buildExecutionAccountability(allTasks).find(
      (r) => str(r.agent).toLowerCase() === str(agentMeta.agentName).toLowerCase()
    ),
    resolvedCount: allTasks.filter((t) => t.resolutionStatus === "COMPLETED").length,
  };
}

/**
 * Sync task lifecycle when executive applies intervention action (bridge, not duplicate).
 */
export function syncTaskFromInterventionAction({
  tenantId,
  issue,
  action,
  actor,
  assignTo = "",
}) {
  if (!issue?.id) return null;
  const taskId = interventionTaskId(issue.id);
  const base = deriveTaskFromIntervention(issue);
  ensureOperationalTaskRecord(tenantId, taskId, {
    taskType: base.taskType,
    severity: base.severity,
    linkedInterventionId: issue.id,
    linkedLabId: base.linkedLabId,
    linkedLabName: base.linkedLabName,
    owner: assignTo || base.owner,
    assignee: assignTo || base.assignee,
    source: "intervention",
  });

  const map = {
    assign_owner: { taskAction: "assign", assignTo },
    escalate: { taskAction: "escalate" },
    mark_reviewed: { taskAction: "acknowledge" },
    request_followup: { taskAction: "require_followup" },
    require_proof: { taskAction: "request_evidence" },
    resolve: { taskAction: "complete" },
    reopen: { taskAction: "reopen" },
    snooze: { taskAction: "block", note: "Snoozed 24h" },
  };
  const spec = map[action];
  if (!spec) return null;

  return applyOperationalTaskAction({
    tenantId,
    taskId,
    action: spec.taskAction,
    actor,
    assignTo: spec.assignTo || assignTo,
    note: spec.note || "",
  });
}
