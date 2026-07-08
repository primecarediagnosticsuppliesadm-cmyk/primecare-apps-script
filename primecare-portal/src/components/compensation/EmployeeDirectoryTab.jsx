import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { COMPENSATION_EMPLOYEE_PROFILE_ROLES } from "@/compensation/enterpriseCompensationRoles.js";

export default function EmployeeDirectoryTab({
  employees = [],
  roleFilter = "all",
  onRoleFilterChange,
  search = "",
  onSearchChange,
  onOpenEmployee,
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
      <p className="text-xs text-slate-600">
        Enterprise employee directory for compensation administration. Open Employee Compensation 360 from any row.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-9 max-w-xs text-xs"
          placeholder="Search employee, role, plan…"
          value={search}
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
          value={roleFilter}
          onChange={(event) => onRoleFilterChange?.(event.target.value)}
        >
          <option value="all">All roles</option>
          {COMPENSATION_EMPLOYEE_PROFILE_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((employee) => (
          <button
            key={employee.profileUserId}
            type="button"
            className="rounded-lg border bg-white p-3 text-left text-xs shadow-sm hover:border-indigo-300"
            onClick={() => onOpenEmployee?.(employee)}
          >
            <p className="font-semibold text-slate-900">{employee.employeeName}</p>
            <p className="text-slate-500 capitalize">{employee.role}</p>
            <p className="mt-1 text-indigo-700">
              {employee.planName || employee.planCode || employee.assignmentStatus || "unassigned"}
            </p>
          </button>
        ))}
      </div>
      {!filtered.length ? (
        <p className="text-sm text-slate-500">No employees match the current filters.</p>
      ) : null}
    </div>
  );
}
