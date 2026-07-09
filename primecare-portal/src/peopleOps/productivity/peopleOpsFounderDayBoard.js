/**
 * RC6 — Founder day board: Needs Attention / In Progress / Completed (UI compose only).
 */
import { getPayrollCycleCopy } from "@/peopleOps/peopleOpsBusinessCopy.js";

function str(value) {
  return String(value ?? "").trim();
}

function statusKey(value) {
  return str(value).toLowerCase();
}

/**
 * Build founder day board from existing productivity + warning signals.
 * Does not change calculations — presentation grouping only.
 */
export function buildFounderDayBoard({
  employeeList = [],
  ownershipWorkspace = null,
  model = null,
  selectedPeriodRow = null,
  recentActivity = [],
  dataQualityWarnings = [],
} = {}) {
  const needsAttention = [];
  const inProgress = [];
  const completed = [];

  const withoutPlan = (employeeList || []).filter((row) => row.assignmentStatus === "unassigned");
  if (withoutPlan.length) {
    needsAttention.push({
      id: "assign-plans",
      title: `${withoutPlan.length} employee${withoutPlan.length === 1 ? "" : "s"} require compensation plans`,
      detail: "They will not be included in payroll until a plan is assigned.",
      actionLabel: "Assign Plans →",
      route: { moduleId: "employees", screenId: "directory" },
    });
  }

  const gaps = ownershipWorkspace?.dashboard?.ownershipGaps || [];
  const unassignedLabs = ownershipWorkspace?.dashboard?.unassignedLabs ?? gaps.length;
  if (gaps.length || unassignedLabs > 0) {
    const count = gaps.length || unassignedLabs;
    needsAttention.push({
      id: "ownership-gaps",
      title: `${count} laborator${count === 1 ? "y has" : "ies have"} no owner`,
      detail: "These labs cannot generate commissions correctly.",
      actionLabel: "Open Ownership →",
      route: { moduleId: "ownership", screenId: "dashboard" },
    });
  }

  const period = selectedPeriodRow || (model?.periodRows || [])[0] || null;
  const status = statusKey(period?.status || model?.reportingContext?.status || "");
  const cycle = getPayrollCycleCopy(status || "draft");
  const periodLabel = period?.periodYm || model?.reportingContext?.periodLabel || "This period";

  if (status === "submitted") {
    needsAttention.push({
      id: "approve-payroll",
      title: "Payroll awaiting approval",
      detail: `${periodLabel} · ${period?.employeeCount ?? "—"} employees`,
      actionLabel: "Approve →",
      route: { moduleId: "payroll", screenId: "run-review", periodId: period?.periodId, runId: period?.runId },
    });
  } else if (status === "approved") {
    needsAttention.push({
      id: "lock-payroll",
      title: "Payroll ready to lock",
      detail: cycle.explanation,
      actionLabel: "Lock Payroll →",
      route: { moduleId: "payroll", screenId: "run-review", periodId: period?.periodId, runId: period?.runId },
    });
  } else if (status === "exported") {
    needsAttention.push({
      id: "mark-paid",
      title: "Waiting for salary confirmation",
      detail: cycle.explanation,
      actionLabel: "Mark Paid →",
      route: { moduleId: "payroll", screenId: "run-review", periodId: period?.periodId, runId: period?.runId },
    });
  }

  for (const warning of dataQualityWarnings || []) {
    if (warning.severity !== "warning" && warning.severity !== "critical") continue;
    if (needsAttention.some((row) => row.id === warning.id)) continue;
    needsAttention.push({
      id: warning.id,
      title: warning.title,
      detail: warning.detail || warning.why,
      actionLabel: warning.actionLabel || "Fix →",
      route: warning.actionRoute,
    });
  }

  if (status === "draft" || status === "previewed") {
    inProgress.push({
      id: "payroll-cycle",
      title: status === "draft" ? "Payroll not generated yet" : "Payroll preview in review",
      detail: `${periodLabel} · ${cycle.explanation}`,
      actionLabel: cycle.actionLabel,
      route: {
        moduleId: "payroll",
        screenId: cycle.actionScreen || "periods",
        periodId: period?.periodId,
        runId: period?.runId,
      },
    });
  } else if (status === "locked") {
    inProgress.push({
      id: "payroll-export",
      title: "Payroll locked — export next",
      detail: cycle.explanation,
      actionLabel: cycle.actionLabel,
      route: { moduleId: "payroll", screenId: "run-review", periodId: period?.periodId, runId: period?.runId },
    });
  } else if (status === "submitted" || status === "approved" || status === "exported") {
    inProgress.push({
      id: "payroll-cycle-progress",
      title: `Payroll cycle · ${cycle.statusLabel}`,
      detail: `${periodLabel} · ${cycle.explanation}`,
      actionLabel: cycle.actionLabel,
      route: { moduleId: "payroll", screenId: "run-review", periodId: period?.periodId, runId: period?.runId },
    });
  }

  for (const item of (recentActivity || []).slice(0, 6)) {
    const title = str(item.title || item.label).toLowerCase();
    if (
      /generated|updated|calculated|assigned|created|approved|locked|exported|paid|activated/.test(title)
    ) {
      completed.push({
        id: `done-${item.id}`,
        title: item.title || item.label,
        detail: item.detail,
        actionLabel: item.viewLabel || "View →",
        route: item.route,
      });
    }
  }

  if (status === "paid") {
    completed.unshift({
      id: "payroll-paid",
      title: `Payroll completed · ${periodLabel}`,
      detail: cycle.explanation,
      actionLabel: null,
      route: null,
    });
  }

  if (!completed.length && !needsAttention.length && !inProgress.length) {
    completed.push({
      id: "quiet-day",
      title: "No urgent people actions right now",
      detail: "Generate payroll or review ownership when you are ready.",
      actionLabel: "Open Payroll →",
      route: { moduleId: "payroll", screenId: "periods" },
    });
  }

  return {
    needsAttention: needsAttention.slice(0, 6),
    inProgress: inProgress.slice(0, 4),
    completed: completed.slice(0, 6),
    question: "What needs my attention today?",
  };
}
