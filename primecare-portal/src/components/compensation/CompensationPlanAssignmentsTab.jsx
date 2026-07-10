import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { COMPENSATION_EMPLOYEE_PROFILE_ROLES } from "@/compensation/enterpriseCompensationRoles.js";

const STATUS_VARIANT = {
  active: "success",
  ended: "neutral",
  suspended: "warning",
};

export default function CompensationPlanAssignmentsTab({
  adminModel,
  permissions,
  onEndAssignment,
  onViewAssignment,
  onOpenAssign,
  onOpenChangePlan,
  busy = false,
}) {
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (adminModel?.assignmentRows || []).filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(row.employeeName || "").toLowerCase().includes(q) ||
        String(row.planName || "").toLowerCase().includes(q)
      );
    });
  }, [adminModel, roleFilter, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Employee plan assignments preserve history. Assign, change plan, or end assignment — no delete.
        </p>
        {permissions?.canAssignPlan ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => onOpenAssign?.()}>
            Assign Employee
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="h-9 max-w-xs text-xs"
          placeholder="Search employee or plan…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="all">All roles</option>
          {COMPENSATION_EMPLOYEE_PROFILE_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <EnterpriseDataTable
        hasRows={rows.length > 0}
        emptyTitle="No plan assignments"
        emptyDescription="Assign a compensation plan to an employee to link payroll preview calculations."
        desktop={
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    "Employee",
                    "Role",
                    "Current Plan",
                    "Plan Version",
                    "Effective From",
                    "Effective To",
                    "Status",
                    "Assigned By",
                    "Actions",
                  ].map((label) => (
                    <th key={label} className="px-2 py-2 whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2 font-medium">{row.employeeName}</td>
                    <td className="px-2 py-2 capitalize">{row.role}</td>
                    <td className="px-2 py-2">{row.planName}</td>
                    <td className="px-2 py-2">{row.planVersion}</td>
                    <td className="px-2 py-2">{row.effectiveFromLabel}</td>
                    <td className="px-2 py-2">{row.effectiveToLabel}</td>
                    <td className="px-2 py-2">
                      <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                    </td>
                    <td className="px-2 py-2">{row.assignedBy}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => onViewAssignment?.(row)}
                        >
                          View
                        </Button>
                        {permissions?.canChangePlan && row.status === "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            onClick={() => onOpenChangePlan?.(row)}
                          >
                            Change Plan
                          </Button>
                        ) : null}
                        {permissions?.canEndAssignment && row.status === "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            disabled={busy}
                            onClick={() => onEndAssignment?.(row)}
                          >
                            End Assignment
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      />
    </div>
  );
}
