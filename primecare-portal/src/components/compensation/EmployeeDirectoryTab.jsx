import React, { useMemo, useState } from "react";
import { Download, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, EnterpriseDataTable, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ux";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import PeopleOpsActionMenu from "@/components/peopleOps/PeopleOpsActionMenu.jsx";
import PeopleOpsTableShell, {
  PeopleOpsTableBody,
  PeopleOpsTableCell,
  PeopleOpsTableHead,
  PeopleOpsTableRow,
} from "@/components/peopleOps/PeopleOpsTableShell.jsx";
import { PEOPLE_OPS_PAYROLL_STATUS_VARIANT } from "@/components/peopleOps/peopleOpsStatusTokens.js";
import { buildEmployeeDirectoryStats } from "@/peopleOps/peopleOpsEnterpriseModel.js";
import { COMPENSATION_EMPLOYEE_PROFILE_ROLES } from "@/compensation/enterpriseCompensationRoles.js";

const ASSIGNMENT_VARIANT = {
  active: "success",
  ended: "neutral",
  unassigned: "warning",
};

function exportEmployeesCsv(rows = []) {
  const header = ["Employee", "Role", "Department", "Plan", "Assignment Status", "Payroll Status", "Updated"];
  const lines = rows.map((row) =>
    [
      row.employeeName,
      row.role,
      row.department,
      row.planName || row.planCode || "",
      row.assignmentStatus,
      row.payrollStatus,
      row.updatedAtLabel,
    ]
      .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "people-operations-employees.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function EmployeeDirectoryTab({
  employees = [],
  roleFilter = "all",
  onRoleFilterChange,
  planFilter = "all",
  onPlanFilterChange,
  assignmentFilter = "all",
  onAssignmentFilterChange,
  search = "",
  onSearchChange,
  onOpenEmployee,
  onClearFilters,
  onBulkAssignPlan,
  onBulkChangePlan,
  permissions,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());

  const planOptions = useMemo(() => {
    const codes = [...new Set(employees.map((row) => row.planCode).filter(Boolean))].sort();
    return [{ value: "all", label: "All plans" }, ...codes.map((code) => ({ value: code, label: code }))];
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (planFilter !== "all" && row.planCode !== planFilter) return false;
      if (assignmentFilter !== "all" && row.assignmentStatus !== assignmentFilter) return false;
      if (!q) return true;
      return (
        String(row.employeeName || "").toLowerCase().includes(q) ||
        String(row.role || "").toLowerCase().includes(q) ||
        String(row.planCode || "").toLowerCase().includes(q) ||
        String(row.department || "").toLowerCase().includes(q)
      );
    });
  }, [employees, roleFilter, planFilter, assignmentFilter, search]);

  const stats = useMemo(() => buildEmployeeDirectoryStats(employees), [employees]);
  const selectedRows = useMemo(
    () => filtered.filter((row) => selectedIds.has(row.profileUserId)),
    [filtered, selectedIds]
  );
  const allVisibleSelected = filtered.length > 0 && filtered.every((row) => selectedIds.has(row.profileUserId));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((row) => row.profileUserId)));
  };

  const toggleRow = (profileUserId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(profileUserId)) next.delete(profileUserId);
      else next.add(profileUserId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <KpiCardGrid columns={3}>
        <KpiCard title="Employees" value={String(stats.total)} subtitle={`${stats.assigned} assigned · ${stats.unassigned} unassigned`} icon={Users} />
        <KpiCard title="Assigned Plans" value={String(stats.assigned)} subtitle="Active compensation assignments" icon={UserPlus} />
        <KpiCard title="Unassigned" value={String(stats.unassigned)} subtitle="Employees without active plan" icon={Users} />
        <KpiCard title="Executives" value={String(stats.executives)} subtitle="Executive profiles" icon={Users} />
        <KpiCard title="HR" value={String(stats.hr)} subtitle="HR profiles" icon={Users} />
        <KpiCard title="Agents" value={String(stats.agents)} subtitle="Field agent profiles" icon={Users} />
        <KpiCard title="Admins" value={String(stats.admins)} subtitle="Admin profiles" icon={Users} />
      </KpiCardGrid>

      <PeopleOpsFilterBar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search employee, role, department, or plan"
        filters={[
          {
            id: "role",
            label: "Role",
            value: roleFilter,
            clearValue: "all",
            onChange: onRoleFilterChange,
            options: [
              { value: "all", label: "All roles" },
              ...COMPENSATION_EMPLOYEE_PROFILE_ROLES.map((role) => ({ value: role, label: role })),
            ],
          },
          {
            id: "plan",
            label: "Plan",
            value: planFilter,
            clearValue: "all",
            onChange: onPlanFilterChange,
            options: planOptions,
          },
          {
            id: "assignment",
            label: "Assignment Status",
            value: assignmentFilter,
            clearValue: "all",
            onChange: onAssignmentFilterChange,
            options: [
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "ended", label: "Ended" },
              { value: "unassigned", label: "Unassigned" },
            ],
          },
        ]}
        resultCount={filtered.length}
        totalCount={employees.length}
        onClear={
          onClearFilters ||
          (() => {
            onSearchChange?.("");
            onRoleFilterChange?.("all");
            onPlanFilterChange?.("all");
            onAssignmentFilterChange?.("all");
          })
        }
      />

      {selectedRows.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <span className="text-sm font-medium text-foreground">{selectedRows.length} selected</span>
          {permissions?.canAssignPlan ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onBulkAssignPlan?.(selectedRows)}>
              Assign Plan
            </Button>
          ) : null}
          {permissions?.canChangePlan ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onBulkChangePlan?.(selectedRows)}>
              Change Plan
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => exportEmployeesCsv(selectedRows)}>
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>
      ) : null}

      <EnterpriseDataTable
        hasRows={filtered.length > 0}
        emptyTitle={employees.length ? "No employees match your filters" : "No employees yet"}
        emptyDescription={
          employees.length
            ? "Try clearing filters or broadening your search."
            : "Employees appear here after profiles are provisioned in Operations Center and assigned compensation plans."
        }
        emptyAction={
          employees.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onSearchChange?.("");
                onRoleFilterChange?.("all");
                onPlanFilterChange?.("all");
                onAssignmentFilterChange?.("all");
              }}
            >
              Clear filters
            </Button>
          ) : null
        }
        desktop={
          <PeopleOpsTableShell>
            <PeopleOpsTableHead>
              <tr>
                <PeopleOpsTableCell header className="w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all employees"
                    className="h-4 w-4 rounded border-border"
                  />
                </PeopleOpsTableCell>
                {["Employee", "Role", "Department", "Compensation Plan", "Assignment Status", "Payroll Status", "Updated", "Actions"].map(
                  (label) => (
                    <PeopleOpsTableCell key={label} header>
                      {label}
                    </PeopleOpsTableCell>
                  )
                )}
              </tr>
            </PeopleOpsTableHead>
            <PeopleOpsTableBody>
              {filtered.map((employee) => (
                <PeopleOpsTableRow key={employee.profileUserId}>
                  <PeopleOpsTableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(employee.profileUserId)}
                      onChange={() => toggleRow(employee.profileUserId)}
                      aria-label={`Select ${employee.employeeName}`}
                      className="h-4 w-4 rounded border-border"
                    />
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left text-[var(--pc-brand-primary)] hover:underline"
                      onClick={() => onOpenEmployee?.(employee)}
                    >
                      {employee.employeeName}
                    </button>
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell className="capitalize">{employee.role}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{employee.department || "—"}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{employee.planName || employee.planCode || "No plan assigned"}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <StatusBadge variant={ASSIGNMENT_VARIANT[employee.assignmentStatus] || "neutral"} label={employee.assignmentStatus} />
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <StatusBadge
                      variant={PEOPLE_OPS_PAYROLL_STATUS_VARIANT[employee.payrollStatus] || "neutral"}
                      label={employee.payrollStatus}
                    />
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell>{employee.updatedAtLabel || "—"}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <PeopleOpsActionMenu
                      ariaLabel={`Actions for ${employee.employeeName}`}
                      items={[
                        { id: "view", label: "View Employee 360", onClick: () => onOpenEmployee?.(employee) },
                        permissions?.canAssignPlan && employee.assignmentStatus === "unassigned"
                          ? { id: "assign", label: "Assign Plan", onClick: () => onBulkAssignPlan?.([employee]) }
                          : null,
                        permissions?.canChangePlan && employee.assignmentStatus === "active"
                          ? { id: "change", label: "Change Plan", onClick: () => onBulkChangePlan?.([employee]) }
                          : null,
                      ]}
                    />
                  </PeopleOpsTableCell>
                </PeopleOpsTableRow>
              ))}
            </PeopleOpsTableBody>
          </PeopleOpsTableShell>
        }
        mobile={
          <div className="space-y-2">
            {filtered.map((employee) => (
              <button
                key={employee.profileUserId}
                type="button"
                className="w-full rounded-xl border border-border bg-card p-4 text-left"
                onClick={() => onOpenEmployee?.(employee)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{employee.employeeName}</p>
                    <p className="text-sm capitalize text-muted-foreground">{employee.role}</p>
                  </div>
                  <StatusBadge variant={ASSIGNMENT_VARIANT[employee.assignmentStatus] || "neutral"} label={employee.assignmentStatus} />
                </div>
                <p className="mt-2 text-sm">{employee.planName || employee.planCode || "No plan assigned"}</p>
              </button>
            ))}
          </div>
        }
      />
    </div>
  );
}
