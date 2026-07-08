import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EnterpriseDataTable, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ux";
import { buildCompensationPlanDetailModel } from "@/compensation/compensationPlanAdminModel.js";
import { simulateCompensationPlan } from "@/compensation/compensationPlanSimulator.js";
import CompensationPlanDetailsPanel from "@/components/compensation/CompensationPlanDetailsPanel.jsx";
import NewCompensationPlanWizard from "@/components/compensation/NewCompensationPlanWizard.jsx";
import PeopleOpsActionMenu from "@/components/peopleOps/PeopleOpsActionMenu.jsx";
import PeopleOpsTableShell, {
  PeopleOpsTableBody,
  PeopleOpsTableCell,
  PeopleOpsTableHead,
  PeopleOpsTableRow,
} from "@/components/peopleOps/PeopleOpsTableShell.jsx";
import { buildCompensationSummaryStats } from "@/peopleOps/peopleOpsEnterpriseModel.js";
import { ClipboardList, FileStack, Layers, Shield } from "lucide-react";

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
  onViewAssignments,
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

  const summary = useMemo(() => buildCompensationSummaryStats(adminModel), [adminModel]);

  return (
    <div className="space-y-4">
      <KpiCardGrid columns={3}>
        <KpiCard title="Plans" value={String(summary.plans)} subtitle="Total compensation plans" icon={FileStack} />
        <KpiCard title="Assignments" value={String(summary.assignments)} subtitle="Active and historical assignments" icon={ClipboardList} />
        <KpiCard title="Active Plans" value={String(summary.activePlans)} subtitle="Currently assignable plans" icon={Shield} />
        <KpiCard title="Inactive Plans" value={String(summary.inactivePlans)} subtitle="Retired plan versions" icon={Layers} />
        <KpiCard title="Draft Plans" value={String(summary.draftPlans)} subtitle="Awaiting activation" icon={FileStack} />
      </KpiCardGrid>

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
          <PeopleOpsTableShell>
            <PeopleOpsTableHead>
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
                  <PeopleOpsTableCell key={label} header>
                    {label}
                  </PeopleOpsTableCell>
                ))}
              </tr>
            </PeopleOpsTableHead>
            <PeopleOpsTableBody>
              {(adminModel?.planRows || []).map((row) => (
                <PeopleOpsTableRow key={row.id}>
                  <PeopleOpsTableCell className="font-medium">{row.planName}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.roleScope}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <StatusBadge variant="info">V{row.version}</StatusBadge>
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.salaryLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.fuelLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.mobileLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.commissionPct}%</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.promotionSalaryLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.promotionCommissionPct}%</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.effectiveFromLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.effectiveToLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <button
                      type="button"
                      className="font-medium text-[var(--pc-brand-primary)] hover:underline"
                      onClick={() => onViewAssignments?.(row)}
                    >
                      {row.assignedEmployees}
                    </button>
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.createdBy}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.createdAtLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <PeopleOpsActionMenu
                      ariaLabel={`Actions for ${row.planName}`}
                      items={[
                        { id: "view", label: "View", onClick: () => openPlan(row) },
                        permissions?.canEditDraftPlan || permissions?.canEditActivePlanViaVersion
                          ? {
                              id: "edit",
                              label: "Edit",
                              onClick: () => {
                                openPlan(row);
                                setEditorOpen(true);
                              },
                            }
                          : null,
                        permissions?.canDuplicatePlan
                          ? { id: "duplicate", label: "Duplicate", disabled: busy, onClick: () => onDuplicatePlan?.(row) }
                          : null,
                        permissions?.canEditDraftPlan && row.status === "draft"
                          ? { id: "activate", label: "Activate", disabled: busy, onClick: () => onActivatePlan?.(row) }
                          : null,
                        permissions?.canDeactivatePlan && row.status !== "retired"
                          ? {
                              id: "deactivate",
                              label: "Deactivate",
                              disabled: busy,
                              destructive: true,
                              onClick: () => onDeactivatePlan?.(row),
                            }
                          : null,
                        { id: "history", label: "History", onClick: () => openPlan(row) },
                      ]}
                    />
                  </PeopleOpsTableCell>
                </PeopleOpsTableRow>
              ))}
            </PeopleOpsTableBody>
          </PeopleOpsTableShell>
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
