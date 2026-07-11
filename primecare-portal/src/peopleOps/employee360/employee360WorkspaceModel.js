/**
 * Employee 360 Workspace — action-oriented read-model compose (no writes, no new SoT).
 */
import { commissionEligibleRoleScope } from "@/compensation/enterpriseCompensationRoles.js";

function str(value) {
  return String(value ?? "").trim();
}

export const EMPLOYEE360_OPERATIONAL_STATUS = Object.freeze({
  READY: "ready",
  NEEDS_ATTENTION: "needs_attention",
  BLOCKED: "blocked",
});

export const EMPLOYEE360_HISTORY_KIND = Object.freeze({
  MILESTONE: "milestone",
  ACTIVITY: "activity",
});

const STATUS_LABELS = {
  [EMPLOYEE360_OPERATIONAL_STATUS.READY]: "Ready",
  [EMPLOYEE360_OPERATIONAL_STATUS.NEEDS_ATTENTION]: "Needs Attention",
  [EMPLOYEE360_OPERATIONAL_STATUS.BLOCKED]: "Blocked",
};

/**
 * @param {{
 *   model?: object,
 *   directoryRow?: object,
 *   ownershipContext?: object,
 *   permissions?: object,
 *   reportingContext?: object,
 * }} input
 */
export function buildEmployee360OperationalStatus(input = {}) {
  const model = input.model || {};
  const row = input.directoryRow || {};
  const ownership = input.ownershipContext;
  const overview = model.overview || {};
  const reasons = [];
  let status = EMPLOYEE360_OPERATIONAL_STATUS.READY;

  const unassigned = row.assignmentStatus === "unassigned" || !model.activeAssignment;
  const incompleteProfile = !str(row.profileUserId) || !str(row.employeeName) || !str(row.role);
  const commissionEligible = model.commissionEligible !== false && commissionEligibleRoleScope(overview.role);
  const noLabs = commissionEligible && ownership && (ownership.managedLabCount ?? 0) === 0;
  const payrollStatus = str(row.payrollStatus || model.payrollHistory?.[0]?.status).toLowerCase();
  const payrollBlocked = ["submitted", "blocked"].includes(payrollStatus);

  if (incompleteProfile) {
    status = EMPLOYEE360_OPERATIONAL_STATUS.BLOCKED;
    reasons.push("Employee profile is incomplete — assignment and payroll may fail.");
  }
  if (unassigned) {
    status = EMPLOYEE360_OPERATIONAL_STATUS.BLOCKED;
    reasons.push("No active compensation plan — employee will not appear in payroll.");
  }
  if (noLabs && status !== EMPLOYEE360_OPERATIONAL_STATUS.BLOCKED) {
    status = EMPLOYEE360_OPERATIONAL_STATUS.NEEDS_ATTENTION;
    reasons.push("No laboratories assigned — commission path is unclear.");
  }
  if (payrollBlocked && status === EMPLOYEE360_OPERATIONAL_STATUS.READY) {
    status = EMPLOYEE360_OPERATIONAL_STATUS.NEEDS_ATTENTION;
    reasons.push(`Payroll is ${row.payrollStatus || payrollStatus} and may need your review.`);
  }
  if (!reasons.length) {
    reasons.push("Employee is ready for the current reporting period.");
  }

  return {
    status,
    label: STATUS_LABELS[status],
    reasons: reasons.slice(0, 3),
  };
}

/**
 * @returns {{ tasks: Array<{ id: string, label: string, detail: string, severity: string, actionKey: string }> }}
 */
export function buildEmployee360CurrentTasks(input = {}) {
  const model = input.model || {};
  const row = input.directoryRow || {};
  const ownership = input.ownershipContext;
  const permissions = input.permissions || {};
  const overview = model.overview || {};
  const tasks = [];

  const unassigned = row.assignmentStatus === "unassigned" || !model.activeAssignment;
  if (unassigned && permissions.canAssignPlan) {
    tasks.push({
      id: "assign-plan",
      label: "Assign compensation plan",
      detail: "Required before payroll preview includes this employee.",
      severity: "critical",
      actionKey: "assign_plan",
    });
  }

  const commissionEligible = model.commissionEligible !== false && commissionEligibleRoleScope(overview.role);
  if (commissionEligible && ownership && (ownership.managedLabCount ?? 0) === 0) {
    tasks.push({
      id: "ownership-gap",
      label: "Assign business ownership",
      detail: "No managed laboratories — commission cannot be attributed.",
      severity: "warning",
      actionKey: "open_ownership",
    });
  }

  const payrollStatus = str(row.payrollStatus || model.payrollHistory?.[0]?.status).toLowerCase();
  if (payrollStatus === "submitted") {
    tasks.push({
      id: "payroll-review",
      label: "Review payroll submission",
      detail: "Payroll run is awaiting approval.",
      severity: "warning",
      actionKey: "view_payroll",
    });
  }

  if (!str(row.profileUserId) || !str(row.employeeName)) {
    tasks.push({
      id: "complete-profile",
      label: "Complete employee profile",
      detail: "Missing identity fields in Operations Center.",
      severity: "critical",
      actionKey: "provision",
    });
  }

  if (
    model.activeAssignment &&
    permissions.canChangePlan &&
    row.assignmentStatus === "active" &&
    tasks.length < 5
  ) {
    tasks.push({
      id: "plan-on-file",
      label: "Compensation plan on file",
      detail: `${overview.compensationPlan || "Plan"} · ${overview.planVersion || "—"}`,
      severity: "info",
      actionKey: "change_plan",
    });
  }

  if (model.promotion?.eligible && commissionEligible && tasks.length < 5) {
    tasks.push({
      id: "promotion-review",
      label: "Review promotion eligibility",
      detail: model.promotion.recommendedPlan
        ? `Recommended: ${model.promotion.recommendedPlan}`
        : "Review-only — no automatic promotion.",
      severity: "info",
      actionKey: "view_history",
    });
  }

  return { tasks: tasks.slice(0, 5) };
}

/**
 * Single next best action from task queue.
 */
export function buildEmployee360NextBestAction(tasks = [], operationalStatus = null) {
  const list = tasks?.tasks || tasks || [];
  const top =
    list.find((row) => row.severity === "critical") ||
    list.find((row) => row.severity === "warning") ||
    list[0];

  if (!top) {
    if (operationalStatus?.status === EMPLOYEE360_OPERATIONAL_STATUS.READY) {
      return {
        title: "No action required",
        reason: "Employee is ready for the current period.",
        consequence: "Continue monitoring payroll and ownership changes.",
        ctaLabel: "View payroll history",
        actionKey: "view_payroll",
      };
    }
    return {
      title: "Review employee status",
      reason: operationalStatus?.reasons?.[0] || "Operational status needs review.",
      consequence: "Payroll or commission may be incorrect if ignored.",
      ctaLabel: "View tasks",
      actionKey: "none",
    };
  }

  const consequences = {
    assign_plan: "Employee will be excluded from payroll preview and pay runs.",
    "ownership-gap": "Commission may calculate to zero or fail attribution checks.",
    "payroll-review": "Payroll cannot proceed to approval until reviewed.",
    "complete-profile": "Directory, assignment, and payroll workflows may break.",
    open_ownership: "Field commission path remains incomplete.",
    change_plan: "Plan changes affect the next payroll preview.",
    view_payroll: "Historical pay may not match expectations.",
    view_history: "Promotion decisions may be delayed.",
  };

  const ctaLabels = {
    assign_plan: "Assign plan",
    open_ownership: "Open ownership",
    view_payroll: "View payroll",
    provision: "Open Operations Center",
    change_plan: "Change plan",
    view_history: "View history",
  };

  return {
    title: top.label,
    reason: top.detail,
    consequence: consequences[top.id] || consequences[top.actionKey] || "Operational risk increases if deferred.",
    ctaLabel: ctaLabels[top.actionKey] || "Take action",
    actionKey: top.actionKey,
  };
}

export function buildEmployee360Snapshot({ model = {}, directoryRow = {} } = {}) {
  const overview = model.overview || {};
  return {
    name: overview.name || directoryRow.employeeName || "—",
    role: overview.role || directoryRow.role || "—",
    department: directoryRow.department || overview.department || "HQ",
    status: overview.status || (directoryRow.active === false ? "inactive" : "active"),
    manager: overview.manager || "—",
    joined: overview.joinDateLabel || overview.joinDate || "—",
    email: overview.email || directoryRow.email || "—",
    phone: overview.phone || overview.mobilePhone || "—",
    profileUserId: model.profileUserId || directoryRow.profileUserId || "—",
  };
}

export function buildEmployee360RelationshipSummary({
  model = {},
  directoryRow = {},
  ownershipContext = null,
} = {}) {
  const overview = model.overview || {};
  const lastPayroll = model.payrollHistory?.[0];
  const labLabels =
    ownershipContext?.managedLabs?.map((lab) => lab.labName).filter(Boolean).join(", ") || "None assigned";

  return {
    manager: overview.manager || ownershipContext?.reportingTo || ownershipContext?.reportingAdmin || "—",
    directReports: ownershipContext?.manages || "—",
    territory: ownershipContext?.territories || overview.territory || "—",
    labs: ownershipContext?.managedLabCount
      ? `${ownershipContext.managedLabCount} · ${labLabels}`
      : labLabels,
    compensation: model.activeAssignment
      ? `${overview.compensationPlan || "—"} · ${overview.planVersion || "—"} (${directoryRow.assignmentStatus || "active"})`
      : "Unassigned",
    payroll: lastPayroll
      ? `${lastPayroll.periodYm} · ${lastPayroll.netPayLabel || "—"} (${lastPayroll.status})`
      : directoryRow.payrollStatus || "No payroll history",
    ownership: ownershipContext?.ownershipChain || ownershipContext?.reportingExecutive || "—",
  };
}

export function buildEmployee360History({ model = {} } = {}) {
  const items = [];
  const overview = model.overview || {};

  if (overview.joinDate || overview.joinDateLabel) {
    items.push({
      id: "milestone-joined",
      kind: EMPLOYEE360_HISTORY_KIND.MILESTONE,
      at: overview.joinDate,
      atLabel: overview.joinDateLabel || overview.joinDate,
      title: "Joined PrimeCare",
      subtitle: overview.role ? `Role: ${overview.role}` : "Profile created",
    });
  }

  for (const row of model.planHistory || []) {
    items.push({
      id: `assignment-${row.id}`,
      kind: EMPLOYEE360_HISTORY_KIND.MILESTONE,
      at: row.effectiveFrom,
      atLabel: row.effectiveFromLabel,
      title: row.isActive ? "Compensation plan assigned" : "Compensation assignment ended",
      subtitle: `${row.planName} · v${row.version}`,
    });
  }

  for (const row of model.payrollHistory || []) {
    if (["locked", "paid", "exported", "approved"].includes(str(row.status).toLowerCase())) {
      items.push({
        id: `payroll-${row.id}`,
        kind: EMPLOYEE360_HISTORY_KIND.MILESTONE,
        at: row.periodYm,
        atLabel: row.periodYm,
        title: `Payroll ${row.status}`,
        subtitle: `Net pay ${row.netPayLabel || "—"}`,
      });
    }
  }

  if (model.promotion?.eligible) {
    items.push({
      id: "milestone-promotion",
      kind: EMPLOYEE360_HISTORY_KIND.MILESTONE,
      at: "",
      atLabel: "Current period",
      title: "Promotion eligible",
      subtitle: model.promotion.recommendedPlan || "Review recommended plan",
    });
  }

  for (const event of model.auditTimeline || []) {
    items.push({
      id: `audit-${event.id}`,
      kind: EMPLOYEE360_HISTORY_KIND.ACTIVITY,
      at: event.at,
      atLabel: event.atLabel,
      title: event.title,
      subtitle: `${event.subtitle || ""} · ${event.actorRole || "—"}`.trim(),
      category: event.category,
    });
  }

  items.sort((a, b) => str(b.at || b.atLabel).localeCompare(str(a.at || a.atLabel)));

  return { items };
}

export function buildEmployee360PayrollRows(model = {}) {
  const lines = model.payrollHistory || [];
  const commissionByPeriod = new Map(
    (model.commissionHistory || []).map((row) => [row.periodYm, row])
  );

  return lines.map((line) => {
    const commission = commissionByPeriod.get(line.periodYm);
    return {
      ...line,
      collectedCashLabel: commission?.collectedCashLabel || "—",
      commissionPct: commission?.commissionPct,
      sourcePayments: commission?.sourcePayments || "—",
    };
  });
}

/**
 * Full workspace view model for UI.
 */
export function buildEmployee360WorkspaceView(input = {}) {
  const operationalStatus = buildEmployee360OperationalStatus(input);
  const currentTasks = buildEmployee360CurrentTasks(input);
  const nextBestAction = buildEmployee360NextBestAction(currentTasks, operationalStatus);

  return {
    operationalStatus,
    currentTasks,
    nextBestAction,
    snapshot: buildEmployee360Snapshot(input),
    relationship: buildEmployee360RelationshipSummary(input),
    history: buildEmployee360History(input),
    payrollRows: buildEmployee360PayrollRows(input.model),
    commissionEligible: input.model?.commissionEligible !== false,
  };
}
