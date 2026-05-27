export const AGENT_VISIT_CONTEXT_KEY = "primecare_agent_visit_context";
export const AGENT_PENDING_VISIT_TASK_KEY = "primecare_pending_visit_task";
export const AGENT_PENDING_COLLECTION_TASK_KEY = "primecare_pending_collection_task";

/**
 * @param {Object} params
 * @param {string} [params.labId]
 * @param {string} [params.labName]
 * @param {string} [params.source]
 * @param {string} [params.taskId]
 * @param {string} [params.nextAction]
 * @param {string} [params.visitType]
 * @param {string} [params.followUpType]
 * @param {string} [params.followUpDate]
 * @param {string} [params.priority]
 * @param {number} [params.outstanding]
 * @param {number} [params.daysOverdue]
 */
export function writeAgentVisitContext(params = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    labId: params.labId || "",
    labName: params.labName || "",
    source: params.source || "agent_daily_workspace",
    taskId: params.taskId || "",
    nextAction: params.nextAction || "",
    outstanding: params.outstanding ?? null,
    daysOverdue: params.daysOverdue ?? null,
    savedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(AGENT_VISIT_CONTEXT_KEY, JSON.stringify(payload));

  const visitType = params.visitType || "Follow-up";
  const followUpType = params.followUpType || "Call";

  sessionStorage.setItem(
    AGENT_PENDING_VISIT_TASK_KEY,
    JSON.stringify({
      taskId: params.taskId || "",
      taskType: "VISIT",
      labId: payload.labId,
      labName: payload.labName,
      nextAction: payload.nextAction,
      followUpType,
      followUpDate: params.followUpDate || "",
      visitType,
      priority: params.priority || "MEDIUM",
    })
  );
}

/**
 * @param {Object} item
 */
export function startVisitFromWorkspaceItem(item, overrides = {}) {
  writeAgentVisitContext({
    labId: item.labId,
    labName: item.labName,
    taskId: item.taskId,
    nextAction: item.nextAction || item.reason,
    source: overrides.source || "agent_daily_workspace",
    visitType: overrides.visitType || "Follow-up",
    followUpType: overrides.followUpType || "Call",
    followUpDate: item.dueDate || "",
    priority: item.priority,
    outstanding: item.outstanding,
    daysOverdue: item.daysOverdue,
  });
}

/**
 * @param {Object} item
 */
export function startCollectionFromWorkspaceItem(item) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    AGENT_PENDING_COLLECTION_TASK_KEY,
    JSON.stringify({
      taskId: item.taskId || "",
      labId: item.labId || "",
      labName: item.labName || "",
      nextAction: item.nextAction || item.reason || "",
    })
  );
}
