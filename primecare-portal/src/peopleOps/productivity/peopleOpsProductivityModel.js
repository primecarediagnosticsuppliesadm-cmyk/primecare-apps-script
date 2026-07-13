/**
 * Phase 8.1B / RC6 — People Operations productivity (UI only, no API/calculation changes).
 */
import { compensationAdminPermissions } from "@/compensation/compensationPlanAdminWorkflow.js";
import {
  buildPayrollWorkflowActions,
  PAYROLL_UI_ACTION_IDS,
  payrollWorkflowPermissions,
} from "@/payroll/payrollWorkflowUi.js";
import { mapActivityToBusinessLanguage } from "@/peopleOps/peopleOpsBusinessCopy.js";

const PAYROLL_WORKFLOW_STAGES = Object.freeze([
  { id: "draft", label: "Draft" },
  { id: "previewed", label: "Preview" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "locked", label: "Locked" },
  { id: "exported", label: "Exported" },
  { id: "paid", label: "Paid" },
]);

const NAV_ACTIONS = Object.freeze({
  OPEN_EMPLOYEES: "open_employees",
  OPEN_REPORTS: "open_reports",
  OPEN_PLANS: "open_plans",
  OPEN_ASSIGNMENTS: "open_assignments",
  OPEN_PAYROLL_PERIODS: "open_payroll_periods",
  OPEN_RUN_REVIEW: "open_run_review",
  OPEN_EXPORTS: "open_exports",
  CREATE_PLAN: "create_plan",
});

function str(value) {
  return String(value ?? "").trim();
}

function statusKey(value) {
  return str(value).toLowerCase();
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function translateActivityEvent(event) {
  const mapped = mapActivityToBusinessLanguage(event);
  return {
    label: mapped.title,
    title: mapped.title,
    detail: mapped.detail,
    viewLabel: mapped.viewLabel,
    route: mapped.route,
    atLabel: mapped.atLabel,
    actorRole: mapped.actorRole,
  };
}

export function buildWorkflowProgress(periodRow) {
  const current = statusKey(periodRow?.status || "draft");
  const currentIndex = PAYROLL_WORKFLOW_STAGES.findIndex((stage) => stage.id === current);
  return PAYROLL_WORKFLOW_STAGES.map((stage, index) => ({
    ...stage,
    state: currentIndex < 0 ? "upcoming" : index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming",
  }));
}

function payrollRouteForPeriod(periodRow, screenId = "periods") {
  return {
    moduleId: "payroll",
    screenId,
    periodId: periodRow?.periodId,
    runId: periodRow?.runId,
  };
}

export function buildQuickActions({
  actorRole,
  selectedPeriodRow,
  adminPermissions = null,
} = {}) {
  const perms = adminPermissions || compensationAdminPermissions(actorRole);
  const payrollPerms = payrollWorkflowPermissions(actorRole);
  const periodRow = selectedPeriodRow;
  const workflowActions = periodRow
    ? buildPayrollWorkflowActions({
        status: periodRow.status,
        hasRun: Boolean(periodRow.runId),
        hasRunLines: Number(periodRow.employeeCount || 0) > 0,
        role: actorRole,
      })
    : [];

  const actions = [];

  const workflowById = new Map(workflowActions.map((row) => [row.id, row]));
  const addWorkflow = (id, fallbackLabel) => {
    const row = workflowById.get(id);
    if (!row) return;
    actions.push({
      id,
      label: row.label || fallbackLabel,
      kind: "workflow",
      enabled: true,
      route: payrollRouteForPeriod(periodRow, id === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW ? "periods" : "run-review"),
      periodId: periodRow?.periodId,
    });
  };

  addWorkflow(PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW, "Generate Payroll Preview");
  addWorkflow(PAYROLL_UI_ACTION_IDS.SUBMIT, "Submit Payroll");
  addWorkflow(PAYROLL_UI_ACTION_IDS.APPROVE, "Approve Payroll");
  addWorkflow(PAYROLL_UI_ACTION_IDS.LOCK, "Lock Payroll");
  addWorkflow(PAYROLL_UI_ACTION_IDS.EXPORT, "Generate Export");
  addWorkflow(PAYROLL_UI_ACTION_IDS.MARK_PAID, "Mark Paid");

  actions.push(
    {
      id: NAV_ACTIONS.OPEN_EMPLOYEES,
      label: "Open Employee Directory",
      kind: "navigate",
      enabled: true,
      route: { moduleId: "employees", screenId: "directory" },
    },
    {
      id: NAV_ACTIONS.OPEN_REPORTS,
      label: "Open Reports",
      kind: "navigate",
      enabled: true,
      route: { moduleId: "reports", screenId: "analytics" },
    },
    {
      id: NAV_ACTIONS.OPEN_PLANS,
      label: "Compensation Plans",
      kind: "navigate",
      enabled: perms.canViewPlans,
      route: { moduleId: "compensation", screenId: "plans" },
    },
    {
      id: NAV_ACTIONS.OPEN_ASSIGNMENTS,
      label: "Plan Assignments",
      kind: "navigate",
      enabled: perms.canAssignPlan || perms.canViewPlans,
      route: { moduleId: "compensation", screenId: "assignments" },
    },
    {
      id: NAV_ACTIONS.CREATE_PLAN,
      label: "Create Compensation Plan",
      kind: "navigate",
      enabled: perms.canCreatePlan,
      route: { moduleId: "compensation", screenId: "plans" },
    },
    {
      id: NAV_ACTIONS.OPEN_PAYROLL_PERIODS,
      label: "Payroll Periods",
      kind: "navigate",
      enabled: payrollPerms.canGeneratePreview || payrollPerms.adminViewOnly,
      route: { moduleId: "payroll", screenId: "periods" },
    }
  );

  return actions;
}

export function buildApprovalInbox({ model, adminModel } = {}) {
  const items = [];
  for (const row of model?.periodRows || []) {
    const status = statusKey(row.status);
    if (status === "submitted") {
      items.push({
        id: `approve-${row.periodId}`,
        title: `Payroll awaiting approval · ${row.periodYm}`,
        detail: `${row.employeeCount} employees · ${row.netPayrollLabel}`,
        tone: "warning",
        route: payrollRouteForPeriod(row, "run-review"),
      });
    } else if (status === "approved") {
      items.push({
        id: `lock-${row.periodId}`,
        title: `Ready to lock payroll · ${row.periodYm}`,
        detail: "Approved payroll can now be locked.",
        tone: "info",
        route: payrollRouteForPeriod(row, "run-review"),
      });
    } else if (status === "locked") {
      items.push({
        id: `export-${row.periodId}`,
        title: `Ready to export · ${row.periodYm}`,
        detail: "Payroll is locked. Create the export next.",
        tone: "info",
        route: payrollRouteForPeriod(row, "run-review"),
      });
    } else if (status === "exported") {
      items.push({
        id: `paid-${row.periodId}`,
        title: `Waiting for salary confirmation · ${row.periodYm}`,
        detail: "Mark payroll as paid after salaries are confirmed.",
        tone: "warning",
        route: payrollRouteForPeriod(row, "run-review"),
      });
    } else if (status === "draft" || status === "previewed") {
      items.push({
        id: `review-${row.periodId}`,
        title: `Payroll preview ready · ${row.periodYm}`,
        detail: "Review employee pay and submit when ready.",
        tone: "neutral",
        route: payrollRouteForPeriod(row, "run-review"),
      });
    }
  }

  for (const plan of adminModel?.planRows || []) {
    if (statusKey(plan.status) === "draft") {
      items.push({
        id: `plan-draft-${plan.id}`,
        title: `Compensation plan awaiting activation · ${plan.planCode}`,
        detail: `Version ${plan.version} · ${plan.assignedEmployees} employees linked`,
        tone: "info",
        route: { moduleId: "compensation", screenId: "plans", planId: plan.id },
      });
    }
  }

  const unassignedCount = (adminModel?.assignmentRows || []).filter((row) => statusKey(row.status) !== "active").length;
  if (unassignedCount > 0) {
    items.push({
      id: "assignments-review",
      title: "Compensation assignments need review",
      detail: `${unassignedCount} employee link(s) are not active`,
      tone: "warning",
      route: { moduleId: "compensation", screenId: "assignments" },
    });
  }

  return items.slice(0, 12);
}

export function buildNotifications({ model, adminModel, employeeList = [] } = {}) {
  const items = [];
  const unassignedEmployees = employeeList.filter(
    (row) => !row.planCode && !row.planName && statusKey(row.assignmentStatus) !== "active"
  );
  if (unassignedEmployees.length) {
    items.push({
      id: "employees-unassigned",
      category: "warning",
      title: `${unassignedEmployees.length} employees are not assigned to any compensation plan`,
      detail: "They will not be included in payroll.",
      route: { moduleId: "employees", screenId: "directory" },
    });
  }

  for (const row of model?.periodRows || []) {
    const status = statusKey(row.status);
    if (status === "previewed" || status === "draft") {
      items.push({
        id: `generated-${row.periodId}`,
        category: "info",
        title: `Payroll preview ready · ${row.periodYm}`,
        detail: "Review employee pay when you are ready.",
        route: payrollRouteForPeriod(row, "run-review"),
      });
    }
    if (status === "exported") {
      items.push({
        id: `exported-${row.periodId}`,
        category: "info",
        title: `Payroll export ready · ${row.periodYm}`,
        detail: "Confirm salaries, then mark payroll as paid.",
        route: { moduleId: "payroll", screenId: "exports", periodId: row.periodId },
      });
    }
    if (["draft", "previewed", "submitted"].includes(status)) {
      items.push({
        id: `overdue-${row.periodId}`,
        category: "critical",
        title: `Payroll cycle in progress · ${row.periodYm}`,
        detail: `Currently ${row.status}. Finish the remaining steps to close this month.`,
        route: payrollRouteForPeriod(row, "run-review"),
      });
    }
  }

  for (const plan of adminModel?.planRows || []) {
    const days = daysUntil(plan.effectiveTo);
    if (days != null && days >= 0 && days <= 30) {
      items.push({
        id: `plan-expire-${plan.id}`,
        category: "warning",
        title: `Compensation plan ends soon · ${plan.planCode}`,
        detail: `Effective through ${plan.effectiveToLabel}`,
        route: { moduleId: "compensation", screenId: "plans", planId: plan.id },
      });
    }
  }

  for (const row of adminModel?.assignmentRows || []) {
    const days = daysUntil(row.effectiveTo);
    if (days != null && days >= 0 && days <= 30) {
      items.push({
        id: `assignment-end-${row.id}`,
        category: "warning",
        title: `Pay plan ending soon · ${row.employeeName}`,
        detail: `Ends ${row.effectiveToLabel}`,
        route: { moduleId: "compensation", screenId: "assignments" },
      });
    }
  }

  return items.slice(0, 14);
}

export function buildRecentActivity(historyEvents = [], limit = 12) {
  return (historyEvents || []).slice(0, limit).map((event) => {
    const translated = translateActivityEvent(event);
    return {
      id: event.id,
      label: translated.title || translated.label,
      title: translated.title || translated.label,
      detail: translated.detail,
      atLabel: translated.atLabel || event.atLabel,
      actorRole: translated.actorRole || event.actorRole,
      viewLabel: translated.viewLabel || "View →",
      route: translated.route || null,
    };
  });
}

export function buildGlobalSearchIndex({ model, adminModel, employeeList = [] } = {}) {
  const groups = {
    employees: [],
    plans: [],
    assignments: [],
    payrollPeriods: [],
    payrollRuns: [],
    exports: [],
    reports: [],
  };

  for (const employee of employeeList) {
    groups.employees.push({
      id: employee.profileUserId,
      label: employee.employeeName,
      meta: `${employee.role} · ${employee.planCode || "unassigned"}`,
      route: { moduleId: "employees", screenId: "directory", profileUserId: employee.profileUserId },
      favoriteKey: `employee:${employee.profileUserId}`,
    });
  }

  for (const plan of adminModel?.planRows || []) {
    groups.plans.push({
      id: plan.id,
      label: `${plan.planCode} v${plan.version}`,
      meta: `${plan.status} · ${plan.roleScope}`,
      route: { moduleId: "compensation", screenId: "plans", planId: plan.id },
      favoriteKey: `plan:${plan.id}`,
    });
  }

  for (const row of adminModel?.assignmentRows || []) {
    groups.assignments.push({
      id: row.id,
      label: row.employeeName,
      meta: `${row.currentPlan} · ${row.status}`,
      route: { moduleId: "compensation", screenId: "assignments", assignmentId: row.id },
      favoriteKey: `assignment:${row.id}`,
    });
  }

  for (const row of model?.periodRows || []) {
    groups.payrollPeriods.push({
      id: row.periodId,
      label: row.periodYm,
      meta: `${row.status} · ${row.netPayrollLabel}`,
      route: payrollRouteForPeriod(row, "periods"),
      favoriteKey: `period:${row.periodId}`,
    });
    if (row.runId) {
      groups.payrollRuns.push({
        id: row.runId,
        label: `${row.periodYm} · V${row.runVersion}`,
        meta: row.status,
        route: payrollRouteForPeriod(row, "run-review"),
        favoriteKey: `run:${row.runId}`,
      });
    }
  }

  for (const row of model?.exportRows || []) {
    groups.exports.push({
      id: row.id,
      label: `${row.periodYm} export`,
      meta: `${row.exportFormat} · ${row.atLabel}`,
      route: { moduleId: "payroll", screenId: "exports" },
      favoriteKey: `export:${row.id}`,
    });
  }

  groups.reports.push({
    id: "analytics",
    label: "Analytics & Reports",
    meta: "Ratios, rankings, forecast, trends",
    route: { moduleId: "reports", screenId: "analytics" },
    favoriteKey: "report:analytics",
  });

  return groups;
}

export function filterGlobalSearch(groups, query) {
  const q = str(query).toLowerCase();
  if (!q) return [];
  const results = [];
  for (const [group, rows] of Object.entries(groups)) {
    for (const row of rows) {
      const haystack = `${row.label} ${row.meta}`.toLowerCase();
      if (haystack.includes(q)) {
        results.push({ ...row, group });
      }
    }
  }
  return results.slice(0, 20);
}

export function buildPeopleOpsProductivityWorkspace({
  model,
  adminModel,
  employeeList = [],
  actorRole,
  selectedPeriodRow,
} = {}) {
  const adminPermissions = compensationAdminPermissions(actorRole);
  return {
    quickActions: buildQuickActions({ actorRole, selectedPeriodRow, adminPermissions }),
    approvalInbox: buildApprovalInbox({ model, adminModel }),
    notifications: buildNotifications({ model, adminModel, employeeList }),
    recentActivity: buildRecentActivity(model?.historyEvents || []),
    searchIndex: buildGlobalSearchIndex({ model, adminModel, employeeList }),
    workflowProgress: buildWorkflowProgress(selectedPeriodRow),
    contextSummary: {
      reportingContext: model?.reportingContext || null,
      payrollStatus: selectedPeriodRow?.status || model?.reportingContext?.status,
      periodLabel: selectedPeriodRow?.periodYm || model?.reportingContext?.periodLabel,
      runVersionLabel: selectedPeriodRow?.runVersion ?? model?.reportingContext?.runVersionLabel,
      employeeCount: selectedPeriodRow?.employeeCount,
      netPayrollLabel: selectedPeriodRow?.netPayrollLabel || model?.contextPreviewTotalLabel,
    },
  };
}

export { NAV_ACTIONS, PAYROLL_WORKFLOW_STAGES };
