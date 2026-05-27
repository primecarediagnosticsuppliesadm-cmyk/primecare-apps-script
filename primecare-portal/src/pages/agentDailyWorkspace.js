import { deriveCreditTierFromLabRecord } from "@/metrics/creditTier.js";
import { summarizeAgentLabsCreditBuckets } from "@/metrics/computeRiskMetrics.js";

/** @typedef {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'} AgentQueuePriority */

/**
 * @typedef {Object} AgentActionQueueItem
 * @property {string} id
 * @property {string} labId
 * @property {string} labName
 * @property {AgentQueuePriority} priority
 * @property {string} queueType
 * @property {string} reason
 * @property {string} nextAction
 * @property {number} outstanding
 * @property {number} daysOverdue
 * @property {string} lastVisit
 * @property {string} [dueDate]
 * @property {string} [creditStatus]
 * @property {string} [qualificationLabel]
 * @property {string} [taskId]
 */

const STALE_VISIT_DAYS = 14;
const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const QUEUE_TYPE_RANK = {
  CREDIT_RISK: 0,
  COLLECTION_DUE: 1,
  OVERDUE_ACCOUNT: 1,
  FOLLOW_UP_DUE: 2,
  VISIT_DUE: 3,
  NO_VISIT: 4,
  INACTIVE_LAB: 4,
  QUALIFICATION_PENDING: 5,
  ONBOARDING_PENDING: 5,
  TASK: 6,
};

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {string|undefined|null} raw
 */
function parseYmd(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "-") return null;
  const d = new Date(s.slice(0, 10));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * @param {Date} from
 * @param {Date} [to]
 */
function daysSince(from, to = new Date()) {
  if (!from) return null;
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function normalizeLab(lab) {
  const outstanding = Number(lab?.outstanding ?? lab?.outstandingAmount ?? 0);
  const creditStatus = deriveCreditTierFromLabRecord({
    ...lab,
    outstanding,
    creditLimit: Number(lab?.creditLimit || 0),
    daysOverdue: Number(lab?.daysOverdue ?? lab?.overdueDays ?? 0),
    allowedOverdueDays: Number(lab?.allowedOverdueDays || 15),
  });
  return {
    ...lab,
    outstanding,
    daysOverdue: Number(lab?.daysOverdue ?? lab?.overdueDays ?? 0),
    creditStatus,
    lastVisit: String(lab?.lastVisit || "-"),
    nextFollowUp: String(lab?.nextFollowUp || "-"),
    stage: String(lab?.stage || ""),
  };
}

/**
 * @param {Object[]} recentVisits
 */
function buildLastVisitByLabId(recentVisits) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const visit of recentVisits || []) {
    const id = String(visit.labId || "").trim();
    if (!id || map.has(id)) continue;
    map.set(id, String(visit.visitDate || "").slice(0, 10) || "-");
  }
  return map;
}

/**
 * @param {AgentQueuePriority} priority
 */
export function priorityToBadgeVariant(priority) {
  if (priority === "CRITICAL") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "MEDIUM") return "info";
  return "neutral";
}

/**
 * @param {string} queueType
 */
export function queueTypeLabel(queueType) {
  const t = String(queueType || "").toUpperCase();
  if (t === "COLLECTION_DUE") return "Collection due";
  if (t === "FOLLOW_UP_DUE") return "Follow-up due";
  if (t === "VISIT_DUE") return "Visit due";
  if (t === "CREDIT_RISK") return "Credit risk";
  if (t === "NO_VISIT") return "No recent visit";
  if (t === "QUALIFICATION_PENDING") return "Qualification";
  if (t === "ONBOARDING_PENDING") return "Onboarding";
  if (t === "INACTIVE_LAB") return "Inactive lab";
  if (t === "OVERDUE_ACCOUNT") return "Overdue account";
  if (t === "TASK") return "Task";
  return "Action";
}

/**
 * @param {Object} workspace
 */
export function buildAgentDailyKpis(workspace) {
  const assignedLabs = (workspace.assignedLabs || []).map(normalizeLab);
  const pendingCollections = workspace.pendingCollections || [];
  const recentVisits = workspace.recentVisits || [];
  const summary = workspace.summary || {};
  const todayYmd = localDateYmd();

  const salesLoggedToday = recentVisits
    .filter((v) => String(v.visitDate || "").slice(0, 10) === todayYmd)
    .reduce((sum, v) => sum + Number(v.soldValue || 0), 0);

  const pendingFollowUps = assignedLabs.filter((lab) => {
    const due = parseYmd(lab.nextFollowUp);
    return due && due.getTime() <= new Date(todayYmd).getTime();
  }).length;

  const creditBuckets = summarizeAgentLabsCreditBuckets(assignedLabs);
  const overdueLabs = assignedLabs.filter((lab) => Number(lab.daysOverdue || 0) > 0).length;
  const overdueRiskLabs = creditBuckets.hold + creditBuckets.nearLimit;
  const activeLabs = Number(summary.activeLabs ?? assignedLabs.length);

  const collectionsToday = (recentVisits || []).filter((visit) => {
    const onToday = String(visit.visitDate || "").slice(0, 10) === todayYmd;
    const type = String(visit.visitType || "").toLowerCase();
    return onToday && (type.includes("collection") || type.includes("payment"));
  }).length;

  let totalPaid = 0;
  let totalExposure = 0;
  for (const row of pendingCollections) {
    totalPaid += Number(row.totalPaid ?? 0);
    totalExposure +=
      Number(row.outstandingAmount ?? row.outstanding ?? 0) + Number(row.totalPaid ?? 0);
  }
  if (!totalExposure) {
    for (const lab of assignedLabs) {
      const out = Number(lab.outstanding || 0);
      totalExposure += out;
    }
    totalPaid = Math.max(0, totalExposure - Number(summary.totalOutstanding ?? 0));
  }
  const recoveryPct =
    totalExposure > 0 ? Math.round((totalPaid / totalExposure) * 100) : null;

  return {
    assignedLabs: assignedLabs.length,
    activeLabs,
    visitsCompletedToday: Number(summary.todayVisits ?? 0),
    collectionsToday,
    pendingFollowUps,
    collectionsDue: pendingCollections.length || Number(summary.pendingCollections ?? 0),
    overdueLabs,
    overdueRiskLabs,
    salesLoggedToday,
    totalOutstanding: Number(summary.totalOutstanding ?? 0),
    recoveryPct,
    formatCurrency,
  };
}

/**
 * @param {ReturnType<typeof normalizeLab>} lab
 * @param {Object} opts
 */
function scoreLabQueueItem(lab, opts) {
  const {
    todayYmd,
    lastVisitByLabId,
    collectionLabIds,
    includeQualification,
  } = opts;

  const lastVisitRaw = lastVisitByLabId.get(String(lab.labId)) || lab.lastVisit;
  const lastVisitDate = parseYmd(lastVisitRaw);
  const staleDays = lastVisitDate != null ? daysSince(lastVisitDate) : STALE_VISIT_DAYS + 1;
  const followUpDate = parseYmd(lab.nextFollowUp);
  const followUpDue =
    followUpDate && followUpDate.getTime() <= new Date(todayYmd).getTime();
  const overdue = Number(lab.daysOverdue || 0);
  const outstanding = Number(lab.outstanding || 0);
  const credit = lab.creditStatus;
  const inCollections = collectionLabIds.has(String(lab.labId));

  /** @type {AgentActionQueueItem[]} */
  const items = [];

  if (credit === "HOLD") {
    items.push({
      id: `${lab.labId}-credit`,
      labId: lab.labId,
      labName: lab.labName,
      priority: overdue > 0 ? "CRITICAL" : "HIGH",
      queueType: "CREDIT_RISK",
      reason: lab.creditReason || "Lab is on credit hold",
      nextAction: "Collect payment or escalate with admin",
      outstanding,
      daysOverdue: overdue,
      lastVisit: lastVisitRaw || "-",
      creditStatus: credit,
      qualificationLabel: lab.stage || "",
    });
  } else if (credit === "NEAR_LIMIT") {
    items.push({
      id: `${lab.labId}-credit-near`,
      labId: lab.labId,
      labName: lab.labName,
      priority: "HIGH",
      queueType: "CREDIT_RISK",
      reason: lab.creditReason || "Lab is near credit limit",
      nextAction: "Visit lab and align on payment plan",
      outstanding,
      daysOverdue: overdue,
      lastVisit: lastVisitRaw || "-",
      creditStatus: credit,
      qualificationLabel: lab.stage || "",
    });
  }

  const isInactive = String(lab.status || "").toLowerCase() === "inactive";
  if (isInactive) {
    items.push({
      id: `${lab.labId}-inactive`,
      labId: lab.labId,
      labName: lab.labName,
      priority: "MEDIUM",
      queueType: "INACTIVE_LAB",
      reason: "Lab marked inactive — confirm status or re-engage",
      nextAction: "Visit lab or update qualification",
      outstanding,
      daysOverdue: overdue,
      lastVisit: lastVisitRaw || "-",
      creditStatus: credit,
      qualificationLabel: lab.stage || "",
      area: lab.area || lab.city || "",
    });
  }

  if (overdue > 0 && outstanding > 0) {
    items.push({
      id: `${lab.labId}-overdue`,
      labId: lab.labId,
      labName: lab.labName,
      priority: overdue >= 14 ? "CRITICAL" : overdue >= 7 ? "HIGH" : "MEDIUM",
      queueType: "OVERDUE_ACCOUNT",
      reason: `Account overdue ${overdue} days`,
      nextAction: "Record collection or escalate",
      outstanding,
      daysOverdue: overdue,
      lastVisit: lastVisitRaw || "-",
      creditStatus: credit,
      qualificationLabel: lab.stage || "",
      area: lab.area || lab.city || "",
    });
  }

  if (inCollections && outstanding > 0) {
    items.push({
      id: `${lab.labId}-collection`,
      labId: lab.labId,
      labName: lab.labName,
      priority: overdue >= 7 ? "HIGH" : overdue > 0 ? "MEDIUM" : "LOW",
      queueType: "COLLECTION_DUE",
      reason: `${formatCurrency(outstanding)} outstanding`,
      nextAction: "Record collection or schedule follow-up",
      outstanding,
      daysOverdue: overdue,
      lastVisit: lastVisitRaw || "-",
      dueDate: lab.nextFollowUp !== "-" ? lab.nextFollowUp : "",
      creditStatus: credit,
      qualificationLabel: lab.stage || "",
    });
  }

  if (followUpDue) {
    items.push({
      id: `${lab.labId}-followup`,
      labId: lab.labId,
      labName: lab.labName,
      priority: overdue > 0 ? "HIGH" : "MEDIUM",
      queueType: "FOLLOW_UP_DUE",
      reason: `Follow-up due ${lab.nextFollowUp}`,
      nextAction: lab.nextFollowUp !== "-" ? `Follow up by ${lab.nextFollowUp}` : "Log follow-up visit",
      outstanding,
      daysOverdue: overdue,
      lastVisit: lastVisitRaw || "-",
      dueDate: lab.nextFollowUp,
      creditStatus: credit,
      qualificationLabel: lab.stage || "",
      area: lab.area || lab.city || "",
    });
  }

  if ((staleDays != null && staleDays >= STALE_VISIT_DAYS) || followUpDue) {
    items.push({
      id: `${lab.labId}-visit`,
      labId: lab.labId,
      labName: lab.labName,
      priority: staleDays != null && staleDays >= STALE_VISIT_DAYS + 7 ? "HIGH" : "MEDIUM",
      queueType: followUpDue ? "VISIT_DUE" : "NO_VISIT",
      reason:
        staleDays != null && staleDays >= STALE_VISIT_DAYS
          ? `No visit in ${staleDays} days`
          : "Visit or follow-up scheduled today",
      nextAction: "Start field visit",
      outstanding,
      daysOverdue: overdue,
      lastVisit: lastVisitRaw || "-",
      dueDate: lab.nextFollowUp !== "-" ? lab.nextFollowUp : "",
      creditStatus: credit,
      qualificationLabel: lab.stage || "",
      area: lab.area || lab.city || "",
    });
  }

  if (includeQualification) {
    const stage = String(lab.stage || "").toLowerCase();
    const needsQualification =
      !stage ||
      stage.includes("pending") ||
      stage.includes("qualif") ||
      stage.includes("new");
    if (needsQualification && String(lab.status || "").toLowerCase() !== "inactive") {
      const isOnboarding =
        !stage || stage.includes("new") || stage.includes("onboard");
      items.push({
        id: `${lab.labId}-qual`,
        labId: lab.labId,
        labName: lab.labName,
        priority: "LOW",
        queueType: isOnboarding ? "ONBOARDING_PENDING" : "QUALIFICATION_PENDING",
        reason: lab.stage ? `Stage: ${lab.stage}` : "Qualification not completed",
        nextAction: "Complete qualification during visit",
        outstanding,
        daysOverdue: overdue,
        lastVisit: lastVisitRaw || "-",
        creditStatus: credit,
        qualificationLabel: lab.stage || "Pending",
        area: lab.area || lab.city || "",
      });
    }
  }

  return items;
}

/**
 * @param {AgentActionQueueItem[]} items
 */
function dedupeQueueItems(items) {
  const byLab = new Map();
  for (const item of items) {
    const key = String(item.labId || item.labName);
    const existing = byLab.get(key);
    if (!existing) {
      byLab.set(key, item);
      continue;
    }
    const itemRank = PRIORITY_RANK[item.priority] ?? 9;
    const existingRank = PRIORITY_RANK[existing.priority] ?? 9;
    let better = existing;
    if (itemRank < existingRank) {
      better = item;
    } else if (itemRank === existingRank) {
      const itemType = QUEUE_TYPE_RANK[item.queueType] ?? 9;
      const existingType = QUEUE_TYPE_RANK[existing.queueType] ?? 9;
      if (itemType < existingType) better = item;
    }
    byLab.set(key, better);
  }
  return [...byLab.values()];
}

/**
 * @param {Object} task
 */
function taskToQueueItem(task) {
  const type = String(task.taskType || "").toUpperCase();
  const priorityRaw = String(task.priority || "MEDIUM").toUpperCase();
  const priority =
    priorityRaw === "CRITICAL" || priorityRaw === "HIGH"
      ? priorityRaw
      : priorityRaw === "MEDIUM"
        ? "MEDIUM"
        : "LOW";

  let queueType = "TASK";
  if (type === "COLLECTION") queueType = "COLLECTION_DUE";
  if (type === "VISIT") queueType = "VISIT_DUE";
  if (type === "FOLLOW_UP") queueType = "FOLLOW_UP_DUE";

  return {
    id: task.taskId || `${task.labId}-${queueType}`,
    labId: task.labId || "",
    labName: task.labName || "-",
    priority,
    queueType,
    reason: task.taskDescription || task.nextAction || "Assigned task",
    nextAction: task.nextAction || task.taskDescription || "Open task",
    outstanding: Number(task.outstanding || 0),
    daysOverdue: Number(task.daysOverdue || 0),
    lastVisit: task.lastVisit || "-",
    dueDate: task.dueDate || "",
    creditStatus: task.creditStatus || "",
    qualificationLabel: task.qualificationLabel || "",
    taskId: task.taskId || "",
  };
}

/**
 * @param {Object} workspace
 * @param {{ limit?: number }} [options]
 */
export function buildAgentActionQueue(workspace, options = {}) {
  const limit = options.limit ?? 15;
  const assignedLabs = (workspace.assignedLabs || []).map(normalizeLab);
  const recentVisits = workspace.recentVisits || [];
  const pendingCollections = workspace.pendingCollections || [];
  const tasks = workspace.tasks || [];
  const todayYmd = localDateYmd();
  const lastVisitByLabId = buildLastVisitByLabId(recentVisits);
  const collectionLabIds = new Set(
    pendingCollections.map((c) => String(c.labId || "")).filter(Boolean)
  );

  const fromLabs = assignedLabs.flatMap((lab) =>
    scoreLabQueueItem(lab, {
      todayYmd,
      lastVisitByLabId,
      collectionLabIds,
      includeQualification: true,
    })
  );

  const fromTasks = tasks.map(taskToQueueItem);
  const merged = dedupeQueueItems([...fromTasks, ...fromLabs]);

  merged.sort((a, b) => {
    const pr =
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    if (Number(b.daysOverdue) !== Number(a.daysOverdue)) {
      return Number(b.daysOverdue) - Number(a.daysOverdue);
    }
    return Number(b.outstanding) - Number(a.outstanding);
  });

  return merged.slice(0, limit);
}

/**
 * @param {Object} workspace
 * @param {{ limit?: number }} [options]
 */
export function buildAgentLabPriorityList(workspace, options = {}) {
  const limit = options.limit ?? 20;
  const queue = buildAgentActionQueue(workspace, { limit: 50 });
  const priorityByLabId = new Map(queue.map((q) => [String(q.labId), q.priority]));

  const labs = (workspace.assignedLabs || []).map(normalizeLab);
  labs.sort((a, b) => {
    const pa = PRIORITY_RANK[priorityByLabId.get(String(a.labId))] ?? 9;
    const pb = PRIORITY_RANK[priorityByLabId.get(String(b.labId))] ?? 9;
    if (pa !== pb) return pa - pb;
    if (Number(b.daysOverdue) !== Number(a.daysOverdue)) {
      return Number(b.daysOverdue) - Number(a.daysOverdue);
    }
    return Number(b.outstanding) - Number(a.outstanding);
  });

  return labs.slice(0, limit).map((lab) => {
    const match = queue.find((q) => String(q.labId) === String(lab.labId));
    return {
      ...lab,
      queuePriority: priorityByLabId.get(String(lab.labId)) || "LOW",
      nextAction: match?.nextAction || (lab.nextFollowUp !== "-" ? `Follow up ${lab.nextFollowUp}` : "Log visit"),
    };
  });
}

/**
 * @param {Object} workspace
 */
/**
 * @param {Object} workspace
 * @param {{ limit?: number }} [options]
 */
export function buildAgentTodaysRoute(workspace, options = {}) {
  const limit = options.limit ?? 8;
  const queue = buildAgentActionQueue(workspace, { limit: 20 });
  const groups = new Map();

  for (const item of queue) {
    const areaKey = String(item.area || "Territory").trim() || "Territory";
    if (!groups.has(areaKey)) groups.set(areaKey, []);
    groups.get(areaKey).push(item);
  }

  const sections = [...groups.entries()]
    .map(([area, stops]) => ({
      area,
      stops: stops.slice(0, 4),
      stopCount: stops.length,
    }))
    .sort((a, b) => b.stopCount - a.stopCount);

  const flat = queue.slice(0, limit).map((item, index) => ({
    ...item,
    routeOrder: index + 1,
  }));

  return { sections, flat };
}

/**
 * @param {Object} workspace
 */
export function buildAgentPerformanceMetrics(workspace) {
  const kpis = buildAgentDailyKpis(workspace);
  const recentVisits = workspace.recentVisits || [];
  const assignedLabs = workspace.assignedLabs || [];
  const todayYmd = localDateYmd();

  const labsTouchedToday = new Set(
    recentVisits
      .filter((v) => String(v.visitDate || "").slice(0, 10) === todayYmd)
      .map((v) => String(v.labId || "").trim())
      .filter(Boolean)
  );

  const followUpsDue = assignedLabs.filter((lab) => {
    const due = parseYmd(lab.nextFollowUp);
    return due && due.getTime() <= new Date(todayYmd).getTime();
  }).length;

  const followUpsClearedToday = [...labsTouchedToday].filter((labId) => {
    const lab = assignedLabs.find((l) => String(l.labId) === labId);
    if (!lab) return false;
    const due = parseYmd(lab.nextFollowUp);
    return due && due.getTime() <= new Date(todayYmd).getTime();
  }).length;

  const followUpCompletionPct =
    followUpsDue > 0 ? Math.round((followUpsClearedToday / followUpsDue) * 100) : null;

  const collectionsRecovered = (workspace.pendingCollections || []).reduce(
    (sum, row) => sum + Number(row.totalPaid ?? 0),
    0
  );

  return {
    visitsCompleted: kpis.visitsCompletedToday,
    collectionsRecovered,
    collectionsRecoveredLabel: formatCurrency(collectionsRecovered),
    activeLabsTouched: labsTouchedToday.size,
    overdueLabs: kpis.overdueLabs,
    followUpCompletionPct,
    recoveryPct: kpis.recoveryPct,
  };
}

/**
 * @param {Object} workspace
 * @param {string} labId
 */
export function buildLabSnapshot(workspace, labId) {
  const key = String(labId || "").trim();
  const lab =
    (workspace.assignedLabs || []).find((l) => String(l.labId) === key) || null;
  const collection =
    (workspace.pendingCollections || []).find((c) => String(c.labId) === key) || null;
  const visits = (workspace.recentVisits || []).filter((v) => String(v.labId) === key);
  const queueItem =
    buildAgentActionQueue(workspace, { limit: 30 }).find((q) => String(q.labId) === key) ||
    null;

  return {
    lab,
    collection,
    visits,
    queueItem,
    labId: key,
    labName: lab?.labName || collection?.labName || queueItem?.labName || key,
  };
}

export function buildAgentDailyWorkspaceModel(workspace) {
  const kpis = buildAgentDailyKpis(workspace);
  const actionQueue = buildAgentActionQueue(workspace);
  const labPriorityList = buildAgentLabPriorityList(workspace);
  const todaysRoute = buildAgentTodaysRoute(workspace);
  const performance = buildAgentPerformanceMetrics(workspace);
  return { kpis, actionQueue, labPriorityList, todaysRoute, performance };
}
