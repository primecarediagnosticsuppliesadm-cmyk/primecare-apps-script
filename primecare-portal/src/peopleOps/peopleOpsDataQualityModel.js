/**
 * RC3–RC5 — UI-only data quality / business validation warnings.
 * Derived from existing read models. Does not mutate data or change business rules.
 */
function str(value) {
  return String(value ?? "").trim();
}

/**
 * Build founder-facing blockers: Problem → Why → Action.
 */
export function buildPeopleOpsDataQualityWarnings({
  model = null,
  employeeList = [],
  adminModel = null,
  ownershipWorkspace = null,
  workforceBudget = null,
} = {}) {
  const warnings = [];

  const employees = employeeList || [];
  const withoutPlan = employees.filter((row) => row.assignmentStatus === "unassigned");
  if (withoutPlan.length) {
    warnings.push({
      id: "missing-assignments",
      severity: "warning",
      blockerLabel: "Payroll Blocker",
      title: `${withoutPlan.length} employee${withoutPlan.length === 1 ? "" : "s"} are not assigned to any compensation plan.`,
      detail: "They will not be included in payroll.",
      why: "Every employee needs an active Compensation Plan before they can appear in a payroll run.",
      actionLabel: "Assign Plans →",
      actionRoute: { moduleId: "employees", screenId: "directory" },
    });
  }

  const nameCounts = new Map();
  for (const row of employees) {
    const key = str(row.employeeName).toLowerCase();
    if (!key) continue;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  const duplicates = [...nameCounts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length) {
    warnings.push({
      id: "duplicate-names",
      severity: "attention",
      blockerLabel: "Directory Attention",
      title: "Possible duplicate employee names",
      detail: `${duplicates.length} name${duplicates.length === 1 ? "" : "s"} appear more than once.`,
      why: "Duplicate names can confuse payroll review and reporting.",
      actionLabel: "Review Employees →",
      actionRoute: { moduleId: "employees", screenId: "directory" },
    });
  }

  const gaps = ownershipWorkspace?.dashboard?.ownershipGaps || [];
  if (gaps.length) {
    warnings.push({
      id: "ownership-gaps",
      severity: "warning",
      blockerLabel: "Commission Blocker",
      title: `${gaps.length} laborator${gaps.length === 1 ? "y is" : "ies are"} missing a primary owner.`,
      detail: "These labs cannot generate commissions correctly.",
      why: "Business Ownership links each laboratory to the person who earns commission on collections.",
      actionLabel: "Open Ownership →",
      actionRoute: { moduleId: "ownership", screenId: "dashboard" },
    });
  }

  const labsWithoutOwner = ownershipWorkspace?.dashboard?.unassignedLabs ?? 0;
  if (labsWithoutOwner > 0 && !gaps.length) {
    warnings.push({
      id: "orphan-ownership",
      severity: "attention",
      blockerLabel: "Commission Attention",
      title: `${labsWithoutOwner} laborator${labsWithoutOwner === 1 ? "y has" : "ies have"} incomplete Business Ownership.`,
      detail: "Assign a Primary Agent and Reporting Admin so commission can flow correctly.",
      why: "Incomplete ownership leaves collections without a clear commission path.",
      actionLabel: "Open Ownership →",
      actionRoute: { moduleId: "ownership", screenId: "explorer" },
    });
  }

  const reporting = model?.reportingContext;
  if (reporting && !str(reporting.payrollRunId)) {
    warnings.push({
      id: "no-run-version",
      severity: "info",
      blockerLabel: "Payroll Ready",
      title: "Payroll has not been generated for this reporting period.",
      detail: "Generate a Payroll Preview to calculate salary and commission lines.",
      why: "A payroll run is required before you can review or approve pay.",
      actionLabel: "Generate Payroll Preview →",
      actionRoute: { moduleId: "payroll", screenId: "periods" },
    });
  }

  const employeeCount = model?.kpis?.employeeCount ?? 0;
  if (reporting?.payrollRunId && employeeCount === 0) {
    warnings.push({
      id: "empty-run",
      severity: "attention",
      blockerLabel: "Payroll Blocker",
      title: "No employees are assigned to this payroll run.",
      detail: "Possible reasons: employees have no compensation plan, payroll preview has not been generated, or the wrong reporting period is selected.",
      why: "A payroll run needs employees with active Compensation Plans for the selected period.",
      actionLabel: "Generate Preview →",
      actionRoute: { moduleId: "payroll", screenId: "periods" },
    });
  }

  const draftPlans = (adminModel?.planRows || []).filter((row) => row.status === "draft");
  if (draftPlans.length) {
    warnings.push({
      id: "draft-plans",
      severity: "info",
      blockerLabel: "Compensation Attention",
      title: `${draftPlans.length} Compensation Plan${draftPlans.length === 1 ? "" : "s"} still in draft.`,
      detail: "Activate plans before assigning them to employees.",
      why: "Draft plans are templates only until activated.",
      actionLabel: "Open Compensation Plans →",
      actionRoute: { moduleId: "compensation", screenId: "plans" },
    });
  }

  const inactivePlans = (adminModel?.planRows || []).filter((row) => row.status === "retired");
  if (inactivePlans.length) {
    warnings.push({
      id: "inactive-plans",
      severity: "info",
      blockerLabel: "Compensation Note",
      title: `${inactivePlans.length} inactive Compensation Plan${inactivePlans.length === 1 ? "" : "s"}.`,
      detail: "Inactive plans stay for history. Confirm active employees use current plans.",
      why: "Employees on inactive plans may be excluded from new payroll runs.",
      actionLabel: "Review Compensation Plans →",
      actionRoute: { moduleId: "compensation", screenId: "plans" },
    });
  }

  const plansWithoutEmployees = (adminModel?.planRows || []).filter((plan) => {
    if (plan.status !== "active") return false;
    const code = str(plan.planCode || plan.plan_code);
    const assigned = (adminModel?.assignmentRows || []).some(
      (row) =>
        (row.status === "active" || row.assignmentStatus === "active") &&
        str(row.planCode || row.plan_code) === code
    );
    return !assigned;
  });
  if (plansWithoutEmployees.length) {
    warnings.push({
      id: "plans-without-employees",
      severity: "info",
      blockerLabel: "Next Step",
      title: `${plansWithoutEmployees.length} Compensation Plan${plansWithoutEmployees.length === 1 ? "" : "s"} have no employees assigned.`,
      detail: "Assign employees so payroll can use these pay templates.",
      why: "A plan with zero employees does not affect payroll until someone is assigned.",
      actionLabel: "Assign Employees →",
      actionRoute: { moduleId: "compensation", screenId: "assignments" },
    });
  }

  const budgetPayroll = workforceBudget?.overview?.currentPayroll ?? model?.kpis?.currentPayrollLiability ?? 0;
  if (!budgetPayroll) {
    warnings.push({
      id: "missing-budget",
      severity: "info",
      blockerLabel: "Budget Note",
      title: "Workforce budget is not configured yet.",
      detail: "Generate a Payroll Preview first — budgeting uses payroll as its planning baseline.",
      why: "Without a payroll preview, the workforce cost envelope has nothing to plan against.",
      actionLabel: "Open Budgeting →",
      actionRoute: { moduleId: "budgeting", screenId: "overview" },
    });
  }

  const periodRows = model?.periodRows || [];
  if (periodRows.length && reporting?.periodId) {
    const latest = periodRows[0]?.periodId;
    if (latest && latest !== reporting.periodId) {
      warnings.push({
        id: "stale-period",
        severity: "attention",
        blockerLabel: "Reporting Attention",
        title: "Reporting period may be out of date.",
        detail: "You are viewing an older payroll period, not the most recent one.",
        why: "Approvals and reports should usually use the current reporting period.",
        actionLabel: "Open Dashboard →",
        actionRoute: { moduleId: "dashboard", screenId: "home" },
      });
    }
  }

  return warnings;
}

/** Format KPI values — avoid misleading zero when data is absent. */
export function formatPeopleOpsMetricValue(value, { emptyLabel = "Not configured" } = {}) {
  if (value === null || value === undefined || value === "") return emptyLabel;
  if (typeof value === "number" && value === 0) return emptyLabel;
  if (value === "0" || value === "₹0") return emptyLabel;
  return value;
}
