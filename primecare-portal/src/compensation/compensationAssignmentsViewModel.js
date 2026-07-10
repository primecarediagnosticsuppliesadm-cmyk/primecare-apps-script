/**
 * UI-only view model for Compensation Assignments segments (All / Active / Unassigned / History).
 */
import { listUnassignedEmployees } from "@/compensation/compensationActionDrawerModel.js";

function str(value) {
  return String(value ?? "").trim();
}

export const COMPENSATION_ASSIGNMENT_SEGMENTS = Object.freeze([
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "unassigned", label: "Unassigned" },
  { id: "history", label: "History" },
]);

function activeAssignmentRows(adminModel) {
  return (adminModel?.assignmentRows || []).filter((row) => row.status === "active");
}

function historyAssignmentRows(adminModel) {
  return (adminModel?.assignmentRows || []).filter(
    (row) => row.status === "ended" || row.status === "suspended"
  );
}

/** Surfaces data-quality issues — duplicate active rows are never collapsed. */
export function findDuplicateActiveAssignmentProfiles(adminModel = null) {
  const counts = new Map();
  for (const row of activeAssignmentRows(adminModel)) {
    const key = str(row.profileUserId);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([profileUserId, count]) => ({ profileUserId, count }));
}

export function buildCompensationAssignmentSegmentCounts(adminModel = null) {
  const activeRows = activeAssignmentRows(adminModel);
  const historyRows = historyAssignmentRows(adminModel);
  const unassignedEmployees = listUnassignedEmployees(adminModel);

  return {
    all: activeRows.length + unassignedEmployees.length,
    active: activeRows.length,
    unassigned: unassignedEmployees.length,
    history: historyRows.length,
  };
}

function unassignedToRow(employee) {
  return {
    id: `unassigned-${employee.profileUserId}`,
    kind: "unassigned",
    profileUserId: employee.profileUserId,
    agentId: employee.agentId || "",
    employeeName: employee.employeeName || "Employee",
    role: employee.role || "—",
    planName: "—",
    planVersion: "—",
    effectiveFromLabel: "—",
    effectiveToLabel: "—",
    status: "unassigned",
    assignedBy: "—",
  };
}

export function buildCompensationAssignmentViewRows({
  adminModel = null,
  segment = "all",
  roleFilter = "all",
  search = "",
} = {}) {
  const activeRows = activeAssignmentRows(adminModel).map((row) => ({ ...row, kind: "active" }));
  const historyRows = historyAssignmentRows(adminModel).map((row) => ({ ...row, kind: "history" }));
  const unassignedRows = listUnassignedEmployees(adminModel).map(unassignedToRow);

  let scoped = [];
  if (segment === "active") scoped = activeRows;
  else if (segment === "unassigned") scoped = unassignedRows;
  else if (segment === "history") scoped = historyRows;
  else scoped = [...activeRows, ...unassignedRows];

  const q = str(search).toLowerCase();
  return scoped.filter((row) => {
    if (roleFilter !== "all" && row.role !== roleFilter) return false;
    if (!q) return true;
    return (
      str(row.employeeName).toLowerCase().includes(q) ||
      str(row.planName).toLowerCase().includes(q) ||
      str(row.role).toLowerCase().includes(q)
    );
  });
}
