export const AGENT_VISIT_CONTEXT_KEY = "primecare_agent_visit_context";
export const AGENT_PENDING_VISIT_TASK_KEY = "primecare_pending_visit_task";
export const AGENT_PENDING_COLLECTION_TASK_KEY = "primecare_pending_collection_task";
export const AGENT_WORKSPACE_RETURN_KEY = "primecare_agent_workspace_return";
export const VISIT_ENTRY_INTENT_KEY = "primecare_visit_entry_intent";
export const START_FAST_VISIT_EVENT = "primecare:startFastVisit";

export function buildVisitEntryIntent(params = {}) {
  return {
    mode: "fast",
    intent: "start_visit",
    labId: params.labId || "",
    labName: params.labName || "",
    source: params.source || "",
    savedAt: params.savedAt || new Date().toISOString(),
  };
}

export function visitModeForNavigation({ explicitQualify = false, hasNewFastVisitIntent = false } = {}) {
  if (explicitQualify) return "wizard";
  if (hasNewFastVisitIntent) return "fast";
  return "fast";
}

export function hasNewFastVisitIntentFromKeys(storage = {}) {
  if (storage[VISIT_ENTRY_INTENT_KEY]) {
    try {
      const parsed =
        typeof storage[VISIT_ENTRY_INTENT_KEY] === "string"
          ? JSON.parse(storage[VISIT_ENTRY_INTENT_KEY])
          : storage[VISIT_ENTRY_INTENT_KEY];
      if (parsed?.mode === "fast" || parsed?.intent === "start_visit") return true;
    } catch {
      return true;
    }
  }
  if (storage[AGENT_PENDING_VISIT_TASK_KEY] || storage.primecare_pending_visit_task) return true;
  if (storage[AGENT_VISIT_CONTEXT_KEY]) return true;
  return false;
}

export function shouldSkipWizardDraftRestore({ hasNewFastVisitIntent = false } = {}) {
  return Boolean(hasNewFastVisitIntent);
}

function getSession() {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    /* ignore */
  }
  return globalThis.sessionStorage || null;
}

function readSessionJson(key) {
  const store = getSession();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function peekNewFastVisitIntent() {
  return (
    readSessionJson(VISIT_ENTRY_INTENT_KEY) ||
    readSessionJson(AGENT_PENDING_VISIT_TASK_KEY) ||
    readSessionJson("primecare_pending_visit_task") ||
    readSessionJson(AGENT_VISIT_CONTEXT_KEY)
  );
}

export function consumeVisitEntryIntent() {
  const intent = peekNewFastVisitIntent();
  const store = getSession();
  if (store) store.removeItem(VISIT_ENTRY_INTENT_KEY);
  return intent;
}

export function writeAgentWorkspaceReturnPath(path = "dashboard") {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AGENT_WORKSPACE_RETURN_KEY, String(path || "dashboard"));
}

export function peekAgentWorkspaceReturnPath() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(AGENT_WORKSPACE_RETURN_KEY) || "";
}

export function consumeAgentWorkspaceReturnPath() {
  if (typeof window === "undefined") return "";
  const value = sessionStorage.getItem(AGENT_WORKSPACE_RETURN_KEY) || "";
  sessionStorage.removeItem(AGENT_WORKSPACE_RETURN_KEY);
  return value;
}

/**
 * @param {Record<string, unknown>} [detail]
 */
export function notifyAgentWorkspaceRefresh(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("primecare:agentWorkspaceRefresh", { detail: { ...detail } })
  );
}

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
  const store = getSession();
  if (!store) return;
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
  store.setItem(AGENT_VISIT_CONTEXT_KEY, JSON.stringify(payload));
  store.setItem(VISIT_ENTRY_INTENT_KEY, JSON.stringify(buildVisitEntryIntent(payload)));

  const visitType = params.visitType || "Follow-up";
  const followUpType = params.followUpType || "Call";

  const pendingTask = {
    taskId: params.taskId || "",
    taskType: "VISIT",
    labId: payload.labId,
    labName: payload.labName,
    nextAction: payload.nextAction,
    followUpType,
    followUpDate: params.followUpDate || "",
    visitType,
    priority: params.priority || "MEDIUM",
    entryMode: "fast",
  };
  store.setItem(AGENT_PENDING_VISIT_TASK_KEY, JSON.stringify(pendingTask));

  const win = globalThis.window;
  try {
    if (win && typeof win.dispatchEvent === "function" && typeof CustomEvent === "function") {
      win.dispatchEvent(
        new CustomEvent(START_FAST_VISIT_EVENT, {
          detail: { ...payload, visitType, followUpType, followUpDate: params.followUpDate || "" },
        })
      );
    }
  } catch {
    /* node verify harness without DOM events */
  }
}

/**
 * @param {Object} item
 */
export function startVisitFromWorkspaceItem(item, overrides = {}) {
  writeAgentWorkspaceReturnPath(overrides.returnPath || "dashboard");
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
  writeAgentWorkspaceReturnPath("dashboard");
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
