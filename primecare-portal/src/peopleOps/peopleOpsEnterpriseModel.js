/**
 * Phase 8.2 — People Operations UI derivations (no API or calculation changes).
 */
import { formatInr, num, roundMoney } from "@/compensation/analytics/analyticsFormatters.js";

function str(value) {
  return String(value ?? "").trim();
}

export function buildEmployeeDirectoryStats(employees = []) {
  const rows = employees || [];
  const assigned = rows.filter((row) => row.assignmentStatus === "active").length;
  const byRole = rows.reduce((acc, row) => {
    const role = str(row.role).toLowerCase() || "other";
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  return {
    total: rows.length,
    assigned,
    unassigned: rows.length - assigned,
    executives: byRole.executive || 0,
    hr: byRole.hr || 0,
    agents: byRole.agent || 0,
    admins: byRole.admin || 0,
  };
}

export function enrichEmployeeDirectoryRows(employees = [], { previewRows = [], assignmentRows = [] } = {}) {
  const assignmentByProfile = new Map(
    (assignmentRows || []).map((row) => [str(row.profileUserId), row])
  );
  const previewByProfile = new Map();
  for (const line of previewRows || []) {
    if (!line.inReportingContext) continue;
    const key = str(line.profileUserId);
    if (key && !previewByProfile.has(key)) previewByProfile.set(key, line);
  }

  return (employees || []).map((employee) => {
    const assignment = assignmentByProfile.get(str(employee.profileUserId));
    const preview = previewByProfile.get(str(employee.profileUserId));
    return {
      ...employee,
      department: employee.department || "HQ",
      payrollStatus: preview?.lifecycleStatus || "—",
      updatedAtLabel:
        assignment?.updatedAtLabel || assignment?.assignedAtLabel || employee.updatedAtLabel || "—",
    };
  });
}

export function buildCompensationSummaryStats(adminModel) {
  const plans = adminModel?.planRows || [];
  const assignments = adminModel?.assignmentRows || [];
  return {
    plans: plans.length,
    assignments: assignments.length,
    activePlans: plans.filter((row) => row.status === "active").length,
    inactivePlans: plans.filter((row) => row.status === "retired").length,
    draftPlans: plans.filter((row) => row.status === "draft").length,
  };
}

export function buildPayrollRunSummary(previewRows = [], reportingContext = null) {
  const runId = str(reportingContext?.payrollRunId);
  const scoped = (previewRows || []).filter((row) => !runId || str(row.runId) === runId);

  const employees = scoped.length;
  const commission = roundMoney(scoped.reduce((sum, row) => sum + num(row.commissionAmount), 0));
  const adjustments = roundMoney(scoped.reduce((sum, row) => sum + num(row.adjustments), 0));
  const recoveries = roundMoney(scoped.reduce((sum, row) => sum + num(row.recoveries), 0));
  const netPayroll = roundMoney(scoped.reduce((sum, row) => sum + num(row.netPreview), 0));
  const grossPayroll = roundMoney(
    scoped.reduce(
      (sum, row) =>
        sum +
        num(row.salaryAmount) +
        num(row.fuelAllowance) +
        num(row.mobileAllowance) +
        num(row.commissionAmount) +
        num(row.bonuses),
      0
    )
  );

  return {
    employees,
    employeesLabel: employees === 0 ? "No employees included in this payroll version." : String(employees),
    grossPayroll,
    grossPayrollLabel: formatInr(grossPayroll),
    commission,
    commissionLabel: formatInr(commission),
    adjustments,
    adjustmentsLabel: formatInr(adjustments),
    recoveries,
    recoveriesLabel: formatInr(recoveries),
    netPayroll,
    netPayrollLabel: formatInr(netPayroll),
  };
}

export function buildDashboardPayrollCard(context, kpis) {
  const status = context?.statusLabel || "—";
  const period = context?.periodLabel || "—";
  const version = context?.runVersionLabel || "—";
  const employees = kpis?.employeeCount ?? 0;
  const liability = kpis?.currentPayrollLiabilityLabel || "—";

  const awaiting =
    status === "Submitted"
      ? "Awaiting approval"
      : status === "Previewed"
        ? "Awaiting review"
        : status === "Draft"
          ? "Awaiting preview"
          : status === "Approved"
            ? "Ready to lock"
            : status === "Locked"
              ? "Ready to export"
              : status === "Exported"
                ? "Awaiting paid evidence"
                : "";

  return {
    title: period,
    value: status,
    subtitle: `${version} · ${employees} employees · ${liability}${awaiting ? ` · ${awaiting}` : ""}`,
  };
}

export function buildDashboardPendingActions(productivity) {
  const inbox = productivity?.approvalInbox || [];
  if (!inbox.length) {
    return { count: 0, items: [], summary: "No pending actions" };
  }
  return {
    count: inbox.length,
    items: inbox.slice(0, 4),
    summary: inbox[0]?.title || `${inbox.length} items need action`,
  };
}
