import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { buildCompensationPlanDetailModel } from "@/compensation/compensationPlanAdminModel.js";
import { simulateCompensationPlan } from "@/compensation/compensationPlanSimulator.js";
import CompensationPlanDetailsPanel from "@/components/compensation/CompensationPlanDetailsPanel.jsx";
import NewCompensationPlanWizard from "@/components/compensation/NewCompensationPlanWizard.jsx";

const STATUS_VARIANT = {
  draft: "neutral",
  active: "success",
  retired: "warning",
};

export default function CompensationPlansTab({
  adminModel,
  permissions,
  onRefresh,
  onCreatePlan,
  onSavePlan,
  onDuplicatePlan,
  onDeactivatePlan,
  onActivatePlan,
  busy = false,
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [simInputs, setSimInputs] = useState({
    commissionRatePct: 3,
    salary: 20000,
    fuel: 5000,
    mobile: 500,
    collectionAmount: 100000,
  });

  const selectedRow = useMemo(
    () => adminModel?.planRows?.find((row) => row.id === selectedPlanId) || null,
    [adminModel, selectedPlanId]
  );

  const detail = useMemo(
    () => (selectedRow ? buildCompensationPlanDetailModel(selectedRow) : null),
    [selectedRow]
  );

  const simulation = useMemo(() => {
    if (!detail) return null;
    return simulateCompensationPlan({
      salary: simInputs.salary,
      fuel: simInputs.fuel,
      mobile: simInputs.mobile,
      commissionRatePct: simInputs.commissionRatePct,
      collectionAmount: simInputs.collectionAmount,
      promotionSalary: detail.promotionRules.promotionSalary,
      promotionCommissionRatePct: detail.promotionRules.promotionCommissionPct,
      promotionCollectionThreshold: detail.variableCompensation.collectionThreshold,
      promotionMinEfficiencyPct: detail.variableCompensation.collectionEfficiencyPct,
      promotionMaxOverdueDays: detail.variableCompensation.maxOverdueDays,
      rulesJson: detail.raw?.rules_json,
    });
  }, [detail, simInputs]);

  const openPlan = (row) => {
    setSelectedPlanId(row.id);
    setEditorOpen(false);
    setSimInputs({
      commissionRatePct: row.commissionPct,
      salary: row.salary,
      fuel: row.fuelAllowance,
      mobile: row.mobileAllowance,
      collectionAmount: 100000,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Master compensation plans for the payroll engine. Active edits create a new version; history is preserved.
        </p>
        {permissions?.canCreatePlan ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => setWizardOpen(true)}>
            New Plan
          </Button>
        ) : null}
      </div>

      <NewCompensationPlanWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        busy={busy}
        onCreate={async (payload) => {
          await onCreatePlan?.(payload);
          setWizardOpen(false);
        }}
      />

      <EnterpriseDataTable
        hasRows={(adminModel?.planRows || []).length > 0}
        emptyTitle="No compensation plans"
        emptyDescription="Create a plan to configure salary, allowances, commission, and promotion rules."
        desktop={
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    "Plan Name",
                    "Role",
                    "Version",
                    "Status",
                    "Salary",
                    "Fuel Allowance",
                    "Mobile Allowance",
                    "Commission %",
                    "Promotion Salary",
                    "Promotion Commission %",
                    "Effective From",
                    "Effective To",
                    "Assigned Employees",
                    "Created By",
                    "Created Date",
                    "Actions",
                  ].map((label) => (
                    <th key={label} className="px-2 py-2 whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(adminModel?.planRows || []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2 font-medium">{row.planName}</td>
                    <td className="px-2 py-2">{row.roleScope}</td>
                    <td className="px-2 py-2">{row.version}</td>
                    <td className="px-2 py-2">
                      <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.salaryLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.fuelLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.mobileLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.commissionPct}%</td>
                    <td className="px-2 py-2 tabular-nums">{row.promotionSalaryLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.promotionCommissionPct}%</td>
                    <td className="px-2 py-2">{row.effectiveFromLabel}</td>
                    <td className="px-2 py-2">{row.effectiveToLabel}</td>
                    <td className="px-2 py-2">{row.assignedEmployees}</td>
                    <td className="px-2 py-2">{row.createdBy}</td>
                    <td className="px-2 py-2">{row.createdAtLabel}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openPlan(row)}>
                          View
                        </Button>
                        {permissions?.canEditDraftPlan || permissions?.canEditActivePlanViaVersion ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            onClick={() => {
                              openPlan(row);
                              setEditorOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {permissions?.canDuplicatePlan ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            disabled={busy}
                            onClick={() => onDuplicatePlan?.(row)}
                          >
                            Duplicate
                          </Button>
                        ) : null}
                        {permissions?.canEditDraftPlan && row.status === "draft" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            disabled={busy}
                            onClick={() => onActivatePlan?.(row)}
                          >
                            Activate
                          </Button>
                        ) : null}
                        {permissions?.canDeactivatePlan && row.status !== "retired" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            disabled={busy}
                            onClick={() => onDeactivatePlan?.(row)}
                          >
                            Deactivate
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

      {detail ? (
        <CompensationPlanDetailsPanel
          detail={detail}
          permissions={permissions}
          editorOpen={editorOpen}
          onCloseEditor={() => setEditorOpen(false)}
          onSave={(payload) => onSavePlan?.(selectedRow, payload)}
          busy={busy}
          simulation={simulation}
          simInputs={simInputs}
          onSimInputChange={(key, value) => setSimInputs((prev) => ({ ...prev, [key]: value }))}
          promotionRows={adminModel?.promotionEligibilityRows || []}
        />
      ) : null}
    </div>
  );
}
