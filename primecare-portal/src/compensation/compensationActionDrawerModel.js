/**
 * UI helpers for CompensationActionDrawer — read-model display only.
 */

export const COMPENSATION_ACTION_MODES = Object.freeze({
  assign: {
    title: "Assign Compensation Plan",
    subtitle: "Assign a compensation plan to this employee.",
    submitLabel: "Assign Plan",
  },
  change: {
    title: "Change Compensation Plan",
    subtitle: "Move this employee to a new compensation plan while preserving assignment history.",
    submitLabel: "Save Change",
  },
});

function str(value) {
  return String(value ?? "").trim();
}

export function resolveCompensationActionEmployee(profileUserId, { employeeList = [], adminModel = null } = {}) {
  const id = str(profileUserId);
  if (!id) return null;
  const fromDirectory = (employeeList || []).find((row) => str(row.profileUserId) === id);
  const fromSelectable = (adminModel?.selectableEmployees || []).find((row) => str(row.profileUserId) === id);
  const fromAssignment = (adminModel?.assignmentRows || []).find((row) => str(row.profileUserId) === id);
  return {
    profileUserId: id,
    employeeName:
      fromDirectory?.employeeName ||
      fromSelectable?.employeeName ||
      fromAssignment?.employeeName ||
      "Employee",
    role: fromDirectory?.role || fromSelectable?.role || fromAssignment?.role || "—",
    department: fromDirectory?.department || "HQ",
    agentId: fromDirectory?.agentId || fromSelectable?.agentId || fromAssignment?.agentId || "",
  };
}

export function resolveActiveAssignmentRow(profileUserId, adminModel, assignmentId = "") {
  const rows = adminModel?.assignmentRows || [];
  if (assignmentId) {
    const byId = rows.find((row) => row.id === assignmentId);
    if (byId) return byId;
  }
  return (
    rows.find((row) => str(row.profileUserId) === str(profileUserId) && row.status === "active") || null
  );
}

export function buildPlanPreview(planRow, { promotionRow = null, payrollCycleLabel = "—" } = {}) {
  if (!planRow) return null;
  const promotionEligible = promotionRow?.eligible === true;
  return {
    planName: planRow.planName || planRow.planCode || "—",
    planCode: planRow.planCode || "—",
    version: planRow.version || "—",
    salary: planRow.salaryLabel || "—",
    fuelAllowance: planRow.fuelLabel || "—",
    mobileAllowance: planRow.mobileLabel || "—",
    commissionPct:
      planRow.commissionPct != null && Number.isFinite(Number(planRow.commissionPct))
        ? `${planRow.commissionPct}%`
        : "—",
    payrollCycle: payrollCycleLabel,
    promotionEligibility: promotionRow
      ? promotionEligible
        ? `Eligible${promotionRow.recommendedNewPlan ? ` · ${promotionRow.recommendedNewPlan}` : ""}`
        : promotionRow.blockedReasons?.length
          ? `Not eligible · ${promotionRow.blockedReasons.join(", ")}`
          : "Not eligible"
      : planRow.roleScope === "agent"
        ? "Review promotion rules in plan"
        : "Not applicable",
    effectiveFromLabel: planRow.effectiveFromLabel || "—",
  };
}

export function listUnassignedEmployees(adminModel) {
  const assigned = new Set(
    (adminModel?.assignmentRows || [])
      .filter((row) => row.status === "active")
      .map((row) => str(row.profileUserId))
  );
  return (adminModel?.selectableEmployees || []).filter((emp) => !assigned.has(str(emp.profileUserId)));
}
