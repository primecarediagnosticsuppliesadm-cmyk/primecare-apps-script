import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { COMPENSATION_EMPLOYEE_PROFILE_ROLES } from "@/compensation/enterpriseCompensationRoles.js";
import {
  buildCompensationAssignmentSegmentCounts,
  buildCompensationAssignmentViewRows,
  COMPENSATION_ASSIGNMENT_SEGMENTS,
  findDuplicateActiveAssignmentProfiles,
} from "@/compensation/compensationAssignmentsViewModel.js";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  active: "success",
  ended: "neutral",
  suspended: "warning",
  unassigned: "warning",
};

const EMPTY_COPY = {
  all: {
    title: "No compensation assignments yet",
    description: "Assign a compensation plan to an employee to link payroll preview calculations.",
  },
  active: {
    title: "No active assignments",
    description: "Active assignments appear here once employees are linked to compensation plans.",
  },
  unassigned: {
    title: "Everyone has a compensation plan",
    description: "All employees in scope are assigned to an active compensation plan.",
  },
  history: {
    title: "No assignment history",
    description: "Ended and suspended assignments are preserved here for audit.",
  },
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
  const [segment, setSegment] = useState("all");
  const [search, setSearch] = useState("");

  const segmentCounts = useMemo(() => buildCompensationAssignmentSegmentCounts(adminModel), [adminModel]);

  const duplicateActiveProfiles = useMemo(
    () => findDuplicateActiveAssignmentProfiles(adminModel),
    [adminModel]
  );

  const rows = useMemo(
    () =>
      buildCompensationAssignmentViewRows({
        adminModel,
        segment,
        roleFilter,
        search,
      }),
    [adminModel, roleFilter, search, segment]
  );

  const emptyCopy = EMPTY_COPY[segment] || EMPTY_COPY.all;

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

      {duplicateActiveProfiles.length ? (
        <div
          className="rounded-lg border border-[var(--pc-warning-border)] bg-[var(--pc-warning-bg)] px-3 py-2 text-xs text-[var(--pc-warning)]"
          role="alert"
        >
          <p className="font-semibold text-foreground">Multiple active assignments detected</p>
          <p className="mt-1 opacity-90">
            {duplicateActiveProfiles.length} employee
            {duplicateActiveProfiles.length === 1 ? "" : "s"} have more than one active assignment record.
            All rows are shown — review in Active or History before changing plans.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Assignment views">
        {COMPENSATION_ASSIGNMENT_SEGMENTS.map((item) => {
          const active = segment === item.id;
          const count = segmentCounts[item.id] ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSegment(item.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                active
                  ? "border-[var(--pc-brand-primary)] bg-[var(--pc-neutral-bg)] text-[var(--pc-brand-primary)]"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/40"
              )}
            >
              {item.label} ({count})
            </button>
          );
        })}
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
      </div>

      <EnterpriseDataTable
        hasRows={rows.length > 0}
        emptyTitle={emptyCopy.title}
        emptyDescription={emptyCopy.description}
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
                        {row.kind === "unassigned" ? (
                          permissions?.canAssignPlan ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              className="h-7 text-[10px]"
                              disabled={busy}
                              onClick={() =>
                                onOpenAssign?.({ profileUserId: row.profileUserId, lockEmployee: true })
                              }
                            >
                              Assign Plan
                            </Button>
                          ) : null
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px]"
                              onClick={() => onViewAssignment?.(row)}
                            >
                              View
                            </Button>
                            {row.kind === "active" && permissions?.canChangePlan ? (
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
                            {row.kind === "active" && permissions?.canEndAssignment ? (
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
                          </>
                        )}
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
