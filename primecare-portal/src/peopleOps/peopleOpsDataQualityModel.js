/**
 * RC3/RC4 — UI-only data quality warnings derived from existing read models.
 * Does not mutate data or change business rules.
 */
function str(value) {
  return String(value ?? "").trim();
}

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
      title: `${withoutPlan.length} employee(s) without active plan assignment`,
      detail: "Assign compensation plans before payroll preview for complete run coverage.",
      actionLabel: "Open Employees",
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
      title: "Possible duplicate employee display names",
      detail: `${duplicates.length} name(s) appear more than once in the directory.`,
      actionLabel: "Open Employees",
      actionRoute: { moduleId: "employees", screenId: "directory" },
    });
  }

  const gaps = ownershipWorkspace?.dashboard?.ownershipGaps || [];
  if (gaps.length) {
    warnings.push({
      id: "ownership-gaps",
      severity: "warning",
      title: `${gaps.length} lab ownership gap(s)`,
      detail: "Some labs lack primary agent or reporting admin in lab_ownership.",
      actionLabel: "Business Ownership",
      actionRoute: { moduleId: "ownership", screenId: "dashboard" },
    });
  }

  const orphanLabs = ownershipWorkspace?.dashboard?.unassignedLabs ?? 0;
  if (orphanLabs > 0) {
    warnings.push({
      id: "orphan-ownership",
      severity: "attention",
      title: `${orphanLabs} lab(s) with orphan ownership`,
      detail: "Labs without complete ownership assignment in the current scope.",
      actionLabel: "Business Ownership",
      actionRoute: { moduleId: "ownership", screenId: "explorer" },
    });
  }

  const reporting = model?.reportingContext;
  if (reporting && !str(reporting.payrollRunId)) {
    warnings.push({
      id: "no-run-version",
      severity: "info",
      title: "No payroll run version selected",
      detail: "Generate or select a payroll preview run for employee-level lines.",
      actionLabel: "Open Payroll",
      actionRoute: { moduleId: "payroll", screenId: "run-review" },
    });
  }

  const employeeCount = model?.kpis?.employeeCount ?? 0;
  if (reporting?.payrollRunId && employeeCount === 0) {
    warnings.push({
      id: "empty-run",
      severity: "attention",
      title: "No employees included in this payroll version",
      detail: "Preview lines are empty for the selected period and version.",
      actionLabel: "Open Payroll",
      actionRoute: { moduleId: "payroll", screenId: "run-review" },
    });
  }

  const draftPlans = (adminModel?.planRows || []).filter((row) => row.status === "draft");
  if (draftPlans.length) {
    warnings.push({
      id: "draft-plans",
      severity: "info",
      title: `${draftPlans.length} compensation plan(s) in draft`,
      detail: "Activate plans before assigning to employees.",
      actionLabel: "Compensation Plans",
      actionRoute: { moduleId: "compensation", screenId: "plans" },
    });
  }

  const inactivePlans = (adminModel?.planRows || []).filter((row) => row.status === "retired");
  if (inactivePlans.length) {
    warnings.push({
      id: "inactive-plans",
      severity: "info",
      title: `${inactivePlans.length} inactive plan version(s)`,
      detail: "Retired plans remain for history; verify active assignments use current versions.",
      actionLabel: "Compensation Plans",
      actionRoute: { moduleId: "compensation", screenId: "plans" },
    });
  }

  const budgetPayroll = workforceBudget?.overview?.currentPayroll ?? model?.kpis?.currentPayrollLiability ?? 0;
  if (!budgetPayroll) {
    warnings.push({
      id: "missing-budget",
      severity: "info",
      title: "Budget not configured",
      detail: "Workforce planning envelope derives from payroll preview — generate a preview first.",
      actionLabel: "Open Budget",
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
        title: "Reporting period may be stale",
        detail: "Selected period is not the most recent payroll period in the read model.",
        actionLabel: "Dashboard",
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
