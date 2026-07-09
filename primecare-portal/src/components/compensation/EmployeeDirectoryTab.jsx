import React, { useMemo, useState, useCallback, useEffect } from "react";
import { Download, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, EnterpriseDataTable, KpiCard, KpiCardGrid, StatusBadge, RoleChip } from "@/components/ux";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import PeopleOpsActionMenu from "@/components/peopleOps/PeopleOpsActionMenu.jsx";
import PeopleOpsTableToolbar, { usePeopleOpsTableDensity } from "@/components/peopleOps/PeopleOpsTableToolbar.jsx";
import PeopleOpsTableShell, {
  PeopleOpsTableBody,
  PeopleOpsTableCell,
  PeopleOpsTableHead,
  PeopleOpsTableRow,
} from "@/components/peopleOps/PeopleOpsTableShell.jsx";
import { PEOPLE_OPS_PAYROLL_STATUS_VARIANT } from "@/components/peopleOps/peopleOpsStatusTokens.js";
import { buildEmployeeDirectoryStats } from "@/peopleOps/peopleOpsEnterpriseModel.js";
import { COMPENSATION_EMPLOYEE_PROFILE_ROLES } from "@/compensation/enterpriseCompensationRoles.js";
import { cn } from "@/lib/utils";

const ASSIGNMENT_VARIANT = {
  active: "success",
  ended: "neutral",
  unassigned: "warning",
};

const AVATAR_STYLES = {
  executive: "bg-violet-100 text-violet-800 ring-violet-200",
  admin: "bg-blue-100 text-blue-800 ring-blue-200",
  agent: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  hr: "bg-slate-100 text-slate-700 ring-slate-200",
  default: "bg-[var(--pc-neutral-bg)] text-[var(--pc-brand-primary)] ring-border",
};

const DIRECTORY_COLUMNS = [
  { id: "employee", label: "Employee" },
  { id: "role", label: "Role" },
  { id: "department", label: "Department" },
  { id: "plan", label: "Compensation Plan" },
  { id: "assignment", label: "Compensation Assignment" },
  { id: "payroll", label: "Payroll Status" },
  { id: "updated", label: "Updated" },
];

function employeeAvatarClass(role) {
  return AVATAR_STYLES[String(role || "").toLowerCase()] || AVATAR_STYLES.default;
}

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
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [density, setDensity] = usePeopleOpsTableDensity("compact");
  const [visibleColumns, setVisibleColumns] = useState(() => DIRECTORY_COLUMNS.map((col) => col.id));
  const [savedFilters, setSavedFilters] = useState([]);

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

  useEffect(() => {
    setFocusedIndex(-1);
  }, [filtered]);

  const handleTableKeyDown = useCallback(
    (event) => {
      if (!filtered.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((index) => Math.min(index + 1, filtered.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter" && focusedIndex >= 0) {
        event.preventDefault();
        onOpenEmployee?.(filtered[focusedIndex]);
      }
    },
    [filtered, focusedIndex, onOpenEmployee]
  );

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
    <div className="space-y-2">
      <KpiCardGrid columns={3} dense>
        <KpiCard dense title="Employees" value={String(stats.total)} subtitle={`${stats.assigned} assigned · ${stats.unassigned} unassigned`} icon={Users} />
        <KpiCard dense title="Assigned Plans" value={String(stats.assigned)} subtitle="Active Compensation Assignments" icon={UserPlus} />
        <KpiCard dense title="Unassigned" value={String(stats.unassigned)} subtitle="Cannot be included in payroll yet" icon={Users} />
        <KpiCard dense title="Executives" value={String(stats.executives)} subtitle="Executive profiles" icon={Users} />
        <KpiCard dense title="HR" value={String(stats.hr)} subtitle="HR profiles" icon={Users} />
        <KpiCard dense title="Agents" value={String(stats.agents)} subtitle="Field agent profiles" icon={Users} />
        <KpiCard dense title="Admins" value={String(stats.admins)} subtitle="Admin profiles" icon={Users} />
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
            label: "Compensation Assignment",
            value: assignmentFilter,
            clearValue: "all",
            onChange: onAssignmentFilterChange,
            options: [
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "ended", label: "Ended" },
              { value: "unassigned", label: "No plan assigned" },
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

      <PeopleOpsTableToolbar
        density={density}
        onDensityChange={setDensity}
        columns={DIRECTORY_COLUMNS}
        visibleColumnIds={visibleColumns}
        onToggleColumn={(id) =>
          setVisibleColumns((prev) => (prev.includes(id) ? prev.filter((col) => col !== id) : [...prev, id]))
        }
        savedFilters={savedFilters}
        onApplyFilter={(preset) => {
          onRoleFilterChange?.(preset.roleFilter || "all");
          onPlanFilterChange?.(preset.planFilter || "all");
          onAssignmentFilterChange?.(preset.assignmentFilter || "all");
          onSearchChange?.(preset.search || "");
        }}
        onSaveFilter={() => {
          const preset = {
            id: `filter-${Date.now()}`,
            label: roleFilter !== "all" ? `${roleFilter} filter` : "Current filter",
            roleFilter,
            planFilter,
            assignmentFilter,
            search,
          };
          setSavedFilters((prev) => [...prev.slice(-4), preset]);
        }}
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
        emptyTitle={employees.length ? "No employees match your filters" : "No employees assigned yet."}
        emptyDescription={
          employees.length
            ? "Try clearing filters or broadening your search."
            : "Employees appear after they are provisioned in Operations Center. Then Assign Compensation Plans →"
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
          <div tabIndex={0} onKeyDown={handleTableKeyDown} aria-label="Employee directory table" className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)] rounded-xl">
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
              {filtered.map((employee, index) => (
                <PeopleOpsTableRow
                  key={employee.profileUserId}
                  className={cn(focusedIndex === index && "bg-muted/60 ring-1 ring-inset ring-[var(--pc-brand-primary)]/30")}
                  onClick={() => onOpenEmployee?.(employee)}
                >
                  <PeopleOpsTableCell onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(employee.profileUserId)}
                      onChange={() => toggleRow(employee.profileUserId)}
                      aria-label={`Select ${employee.employeeName}`}
                      className="h-4 w-4 rounded border-border"
                    />
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase ring-1",
                          employeeAvatarClass(employee.role)
                        )}
                        aria-hidden
                      >
                        {(employee.employeeName || "?").slice(0, 2)}
                      </span>
                      <span>{employee.employeeName}</span>
                    </div>
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <RoleChip role={employee.role} />
                  </PeopleOpsTableCell>
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
                  <PeopleOpsTableCell onClick={(event) => event.stopPropagation()}>
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
          </div>
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
