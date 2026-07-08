import React, { useMemo } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/ux";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import { COMPENSATION_EMPLOYEE_PROFILE_ROLES } from "@/compensation/enterpriseCompensationRoles.js";

export default function EmployeeDirectoryTab({
  employees = [],
  roleFilter = "all",
  onRoleFilterChange,
  search = "",
  onSearchChange,
  onOpenEmployee,
  onClearFilters,
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (!q) return true;
      return (
        String(row.employeeName || "").toLowerCase().includes(q) ||
        String(row.role || "").toLowerCase().includes(q) ||
        String(row.planCode || "").toLowerCase().includes(q)
      );
    });
  }, [employees, roleFilter, search]);

  return (
    <div className="space-y-4">
      <PeopleOpsFilterBar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search employee, role, or plan"
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
        ]}
        resultCount={filtered.length}
        totalCount={employees.length}
        onClear={
          onClearFilters ||
          (() => {
            onSearchChange?.("");
            onRoleFilterChange?.("all");
          })
        }
      />

      {filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((employee) => (
            <button
              key={employee.profileUserId}
              type="button"
              className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-[var(--pc-brand-primary)]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)]"
              onClick={() => onOpenEmployee?.(employee)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{employee.employeeName}</p>
                  <p className="mt-0.5 text-sm capitalize text-muted-foreground">{employee.role}</p>
                </div>
                <StatusBadge
                  variant={employee.assignmentStatus === "active" ? "success" : "neutral"}
                  label={employee.assignmentStatus || "unassigned"}
                />
              </div>
              <p className="mt-3 text-sm font-medium text-[var(--pc-brand-primary)]">
                {employee.planName || employee.planCode || "No plan assigned"}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={employees.length ? "No employees match your filters" : "No Employees Yet"}
          description={
            employees.length
              ? "Try clearing filters or broadening your search."
              : "Employees appear here after profiles are provisioned in Operations Center and assigned compensation plans."
          }
          action={
            employees.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onSearchChange?.("");
                  onRoleFilterChange?.("all");
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
}
