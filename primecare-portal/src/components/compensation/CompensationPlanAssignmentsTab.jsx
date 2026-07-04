import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";

const STATUS_VARIANT = {
  active: "success",
  ended: "neutral",
  suspended: "warning",
};

export default function CompensationPlanAssignmentsTab({
  adminModel,
  permissions,
  onChangePlan,
  onEndAssignment,
  busy = false,
}) {
  const [changeTarget, setChangeTarget] = useState(null);
  const [newPlanId, setNewPlanId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        Employee plan assignments preserve history. Change plan creates a new assignment; end assignment closes the current row.
      </p>

      <EnterpriseDataTable
        hasRows={(adminModel?.assignmentRows || []).length > 0}
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
                {(adminModel?.assignmentRows || []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2 font-medium">{row.employeeName}</td>
                    <td className="px-2 py-2">{row.role}</td>
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
                        <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]">
                          View
                        </Button>
                        {permissions?.canChangePlan && row.status === "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            onClick={() => {
                              setChangeTarget(row);
                              setNewPlanId(row.planId);
                            }}
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

      {changeTarget && permissions?.canChangePlan ? (
        <section className="rounded-lg border bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Change Plan · {changeTarget.employeeName}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">New Plan</span>
              <select
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                value={newPlanId}
                onChange={(event) => setNewPlanId(event.target.value)}
              >
                {(adminModel?.selectablePlans || []).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.planName} · {plan.version}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Effective Date</span>
              <Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
            </label>
            <div className="flex items-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setChangeTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !newPlanId}
                onClick={() => {
                  onChangePlan?.(changeTarget, { newPlanId, effectiveDate });
                  setChangeTarget(null);
                }}
              >
                Save Change
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
