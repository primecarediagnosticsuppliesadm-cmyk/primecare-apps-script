import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { buildCompensationPlanDetailModel } from "@/compensation/compensationPlanAdminModel.js";
import { simulateCompensationPlan } from "@/compensation/compensationPlanSimulator.js";
import CompensationPlanDetailsPanel from "@/components/compensation/CompensationPlanDetailsPanel.jsx";
import CompensationPlanActionDrawer, {
  COMPENSATION_PLAN_ACTION_MODES,
} from "@/components/compensation/CompensationPlanActionDrawer.jsx";
import PeopleOpsActionMenu from "@/components/peopleOps/PeopleOpsActionMenu.jsx";
import PeopleOpsTableShell, {
  PeopleOpsTableBody,
  PeopleOpsTableCell,
  PeopleOpsTableHead,
  PeopleOpsTableRow,
} from "@/components/peopleOps/PeopleOpsTableShell.jsx";
import { buildCompensationSummaryStats } from "@/peopleOps/peopleOpsEnterpriseModel.js";

const STATUS_VARIANT = {
  draft: "neutral",
  active: "success",
  retired: "warning",
};

function PlansReadinessCard({ stats, onReviewDrafts }) {
  const draftLabel =
    stats.draftPlans === 1 ? "1 draft requires review" : `${stats.draftPlans} drafts require review`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          {stats.activePlans} active plans · {stats.draftPlans ? draftLabel : "all drafts cleared"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {stats.plans} total plans · {stats.assignments} assignments · {stats.inactivePlans} inactive
        </p>
      </div>
      {stats.draftPlans > 0 && onReviewDrafts ? (
        <Button type="button" size="sm" variant="outline" onClick={onReviewDrafts}>
          Review Draft
        </Button>
      ) : null}
    </div>
  );
}

export default function CompensationPlansTab({
  adminModel,
  permissions,
  onCreatePlan,
  onSavePlan,
  onDuplicatePlan,
  onDeactivatePlan,
  onActivatePlan,
  onViewAssignments,
  onAssignEmployees,
  busy = false,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planAction, setPlanAction] = useState(null);
  const [planMutationError, setPlanMutationError] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveMutationError, setSaveMutationError] = useState(null);
  const [simInputs, setSimInputs] = useState({
    commissionRatePct: 3,
    salary: 20000,
    fuel: 5000,
    mobile: 500,
    collectionAmount: 100000,
  });

  const summary = useMemo(() => buildCompensationSummaryStats(adminModel), [adminModel]);

  const filteredRows = useMemo(() => {
    let rows = adminModel?.planRows || [];
    if (statusFilter !== "all") {
      rows = rows.filter((row) => row.status === statusFilter);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      rows = rows.filter((row) => {
        const haystack = [
          row.planName,
          row.planCode,
          row.roleScope,
          row.status,
          row.version,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    return rows;
  }, [adminModel, search, statusFilter]);

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

  const openPlan = (row, { expandDetails = true, openEditor = false } = {}) => {
    setSelectedPlanId(row.id);
    setDetailsOpen(expandDetails);
    setEditorOpen(openEditor);
    setSaveMutationError(null);
    setSimInputs({
      commissionRatePct: row.commissionPct,
      salary: row.salary,
      fuel: row.fuelAllowance,
      mobile: row.mobileAllowance,
      collectionAmount: 100000,
    });
  };

  const openPlanAction = (mode, planRow = null) => {
    setPlanAction({ mode, planRow });
    setPlanMutationError(null);
  };

  const closePlanAction = () => {
    setPlanAction(null);
    setPlanMutationError(null);
  };

  const handlePlanActionSubmit = async ({ mode, planRow, payload }) => {
    setPlanMutationError(null);
    let result = { success: false };

    if (mode === COMPENSATION_PLAN_ACTION_MODES.CREATE) {
      result = (await onCreatePlan?.(payload)) || { success: false };
    } else if (mode === COMPENSATION_PLAN_ACTION_MODES.DUPLICATE) {
      result = (await onDuplicatePlan?.(planRow)) || { success: false };
    } else if (mode === COMPENSATION_PLAN_ACTION_MODES.ACTIVATE) {
      result = (await onActivatePlan?.(planRow)) || { success: false };
    } else if (mode === COMPENSATION_PLAN_ACTION_MODES.DEACTIVATE) {
      result = (await onDeactivatePlan?.(planRow)) || { success: false };
    } else if (mode === COMPENSATION_PLAN_ACTION_MODES.EDIT && planRow && payload) {
      result = (await onSavePlan?.(planRow, payload)) || { success: false };
    }

    if (!result.success) {
      setPlanMutationError(result.error || null);
      return;
    }
    closePlanAction();
  };

  const handlePlanErrorAction = (actionId) => {
    if (actionId === "open_existing" && planMutationError?.existingPlanId) {
      const row = (adminModel?.planRows || []).find((item) => item.id === planMutationError.existingPlanId);
      closePlanAction();
      if (row) openPlan(row, { expandDetails: true });
      return;
    }
    if (actionId === "change_version") {
      setPlanMutationError(null);
    }
  };

  const handleSaveDetails = async (payload) => {
    if (!selectedRow) return;
    setSaveMutationError(null);
    const result = (await onSavePlan?.(selectedRow, payload)) || { success: false };
    if (!result.success) {
      setSaveMutationError(result.error || null);
      return;
    }
    setEditorOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Are compensation plans ready, and which plan do you need to manage?
        </p>
        {permissions?.canCreatePlan ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => openPlanAction(COMPENSATION_PLAN_ACTION_MODES.CREATE)}
          >
            Create Plan
          </Button>
        ) : null}
      </div>

      <PlansReadinessCard
        stats={summary}
        onReviewDrafts={() => setStatusFilter("draft")}
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Search</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search plans by name, code, role, or status"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="retired">Retired</option>
          </select>
        </label>
      </div>

      <EnterpriseDataTable
        hasRows={filteredRows.length > 0}
        emptyTitle="No Compensation Plans yet."
        emptyDescription="Create a Compensation Plan to define salary, allowances, and commission — then Assign Employees →"
        emptyAction={
          permissions?.canCreatePlan ? (
            <Button type="button" size="sm" onClick={() => openPlanAction(COMPENSATION_PLAN_ACTION_MODES.CREATE)}>
              Create Plan
            </Button>
          ) : null
        }
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
              {filteredRows.map((row) => (
                <PeopleOpsTableRow key={row.id}>
                  <PeopleOpsTableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left font-medium text-[var(--pc-brand-primary)] hover:underline"
                      onClick={() => openPlan(row, { expandDetails: true })}
                    >
                      {row.planName}
                    </button>
                  </PeopleOpsTableCell>
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
                        { id: "view", label: "View", onClick: () => openPlan(row, { expandDetails: true }) },
                        permissions?.canEditDraftPlan || permissions?.canEditActivePlanViaVersion
                          ? {
                              id: "edit",
                              label: "Edit",
                              onClick: () => {
                                if (row.status === "draft") {
                                  openPlanAction(COMPENSATION_PLAN_ACTION_MODES.EDIT, row);
                                } else {
                                  openPlan(row, { expandDetails: true, openEditor: true });
                                }
                              },
                            }
                          : null,
                        permissions?.canDuplicatePlan
                          ? {
                              id: "duplicate",
                              label: "Duplicate",
                              disabled: busy,
                              onClick: () => openPlanAction(COMPENSATION_PLAN_ACTION_MODES.DUPLICATE, row),
                            }
                          : null,
                        permissions?.canEditDraftPlan && row.status === "draft"
                          ? {
                              id: "activate",
                              label: "Activate",
                              disabled: busy,
                              onClick: () => openPlanAction(COMPENSATION_PLAN_ACTION_MODES.ACTIVATE, row),
                            }
                          : null,
                        permissions?.canDeactivatePlan && row.status !== "retired"
                          ? {
                              id: "deactivate",
                              label: "Deactivate",
                              disabled: busy,
                              destructive: true,
                              onClick: () => openPlanAction(COMPENSATION_PLAN_ACTION_MODES.DEACTIVATE, row),
                            }
                          : null,
                        { id: "history", label: "History", onClick: () => openPlan(row, { expandDetails: true }) },
                      ]}
                    />
                  </PeopleOpsTableCell>
                </PeopleOpsTableRow>
              ))}
            </PeopleOpsTableBody>
          </PeopleOpsTableShell>
        }
      />

      {detail && detailsOpen ? (
        <details open className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
            Plan details · {detail.general.displayName} ({detail.general.planCode} · {detail.general.version})
          </summary>
          <div className="border-t border-border p-4">
            <CompensationPlanDetailsPanel
              detail={detail}
              permissions={permissions}
              editorOpen={editorOpen}
              onCloseEditor={() => setEditorOpen(false)}
              onSave={handleSaveDetails}
              busy={busy}
              mutationError={saveMutationError}
              simulation={simulation}
              simInputs={simInputs}
              onSimInputChange={(key, value) => setSimInputs((prev) => ({ ...prev, [key]: value }))}
              promotionRows={adminModel?.promotionEligibilityRows || []}
            />
          </div>
        </details>
      ) : null}

      <CompensationPlanActionDrawer
        open={Boolean(planAction)}
        mode={planAction?.mode || COMPENSATION_PLAN_ACTION_MODES.CREATE}
        planRow={planAction?.planRow || null}
        busy={busy}
        mutationError={planMutationError}
        onSubmit={handlePlanActionSubmit}
        onCancel={closePlanAction}
        onErrorAction={handlePlanErrorAction}
      />
    </div>
  );
}
