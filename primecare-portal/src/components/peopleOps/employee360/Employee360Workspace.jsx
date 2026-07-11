import React, { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnterpriseDataTable, ListSkeleton, StatusBadge } from "@/components/ux";
import CompensationAttributionPreview from "@/components/peopleOps/ownership/CompensationAttributionPreview.jsx";
import { buildEmployee360WorkspaceView } from "@/peopleOps/employee360/employee360WorkspaceModel.js";
import Employee360NextBestActionCard from "@/components/peopleOps/employee360/Employee360NextBestActionCard.jsx";
import Employee360OperationalStatusCard from "@/components/peopleOps/employee360/Employee360OperationalStatusCard.jsx";
import Employee360CurrentTasksList from "@/components/peopleOps/employee360/Employee360CurrentTasksList.jsx";
import Employee360RelationshipSummary from "@/components/peopleOps/employee360/Employee360RelationshipSummary.jsx";
import Employee360QuickActionsRow from "@/components/peopleOps/employee360/Employee360QuickActionsRow.jsx";
import Employee360HistoryPanel from "@/components/peopleOps/employee360/Employee360HistoryPanel.jsx";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  draft: "neutral",
  previewed: "info",
  submitted: "warning",
  approved: "info",
  locked: "warning",
  exported: "success",
  paid: "success",
  active: "success",
  ended: "neutral",
};

const BASE_TABS = [
  { id: "today", label: "Today" },
  { id: "compensation", label: "Compensation" },
  { id: "payroll", label: "Payroll" },
  { id: "ownership", label: "Ownership" },
  { id: "history", label: "History" },
];

function SnapshotCard({ snapshot, reportingPeriodLabel }) {
  if (!snapshot) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid="employee360-snapshot">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Employee snapshot</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-lg font-semibold text-foreground">{snapshot.name}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {snapshot.role} · {snapshot.department}
          </p>
        </div>
        <div className="text-xs text-muted-foreground sm:text-right">
          <p>Joined {snapshot.joined}</p>
          <p>Manager: {snapshot.manager}</p>
          {reportingPeriodLabel ? <p>Period: {reportingPeriodLabel}</p> : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Email:</span> {snapshot.email}
        </p>
        <p>
          <span className="text-muted-foreground">Phone:</span> {snapshot.phone}
        </p>
      </div>
    </section>
  );
}

export default function Employee360Workspace({
  mode = "full",
  model,
  directoryRow = null,
  ownershipContext = null,
  permissions,
  reportingContext = null,
  loading = false,
  error = "",
  onBack,
  onOpenFullWorkspace,
  onAction,
  className,
}) {
  const [activeTab, setActiveTab] = useState("today");

  const workspace = useMemo(() => {
    if (!model) return null;
    return buildEmployee360WorkspaceView({
      model,
      directoryRow,
      ownershipContext,
      permissions,
      reportingContext,
    });
  }, [model, directoryRow, ownershipContext, permissions, reportingContext]);

  const tabs = useMemo(() => {
    const list = [...BASE_TABS];
    if (!workspace?.commissionEligible) {
      return list.filter((tab) => tab.id !== "ownership");
    }
    return list;
  }, [workspace?.commissionEligible]);

  const reportingPeriodLabel = reportingContext?.periodYm || reportingContext?.periodLabel || "";

  const handleAction = (actionKey) => {
    onAction?.(actionKey);
  };

  if (loading && !model) {
    return <ListSkeleton rows={6} />;
  }

  if (error && !model) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
    );
  }

  if (!model || !workspace) {
    return <p className="text-sm text-muted-foreground">Select an employee to open the workspace.</p>;
  }

  const isCompact = mode === "compact";
  const visibleTab = isCompact ? "today" : activeTab;

  return (
    <div className={cn("space-y-4", className)} data-testid="employee360-workspace">
      {mode === "full" ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {onBack ? (
              <Button type="button" size="sm" variant="outline" onClick={onBack}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to directory
              </Button>
            ) : null}
            <h2 className="mt-2 text-xl font-bold text-foreground">Employee Workspace</h2>
            <p className="text-xs text-muted-foreground">
              {workspace.snapshot.name} · {workspace.snapshot.role}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick view</p>
          {onOpenFullWorkspace ? (
            <Button type="button" size="sm" variant="outline" onClick={onOpenFullWorkspace}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Open workspace
            </Button>
          ) : null}
        </div>
      )}

      {!isCompact ? (
        <Employee360QuickActionsRow
          permissions={permissions}
          directoryRow={directoryRow}
          hasActiveAssignment={Boolean(model.activeAssignment)}
          commissionEligible={workspace.commissionEligible}
          onAction={handleAction}
        />
      ) : null}

      {!isCompact ? (
        <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1" aria-label="Employee workspace tabs">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={activeTab === tab.id ? "default" : "ghost"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </nav>
      ) : null}

      {visibleTab === "today" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4 xl:col-span-2">
            <Employee360NextBestActionCard action={workspace.nextBestAction} onAction={handleAction} />
          </div>
          <Employee360OperationalStatusCard operationalStatus={workspace.operationalStatus} />
          <SnapshotCard snapshot={workspace.snapshot} reportingPeriodLabel={reportingPeriodLabel} />
          <Employee360CurrentTasksList
            className="xl:col-span-2"
            tasks={workspace.currentTasks.tasks}
            onTaskAction={handleAction}
          />
          {!isCompact ? (
            <Employee360RelationshipSummary className="xl:col-span-2" relationship={workspace.relationship} />
          ) : null}
        </div>
      ) : null}

      {!isCompact && visibleTab === "compensation" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current pay structure</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Source: Compensation → Assignments. Changes use the compensation workflow drawer.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Plan</p>
                <p className="text-sm">{model.overview?.compensationPlan || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Version</p>
                <p className="text-sm">{model.overview?.planVersion || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Salary</p>
                <p className="text-sm">{model.overview?.salaryLabel || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Assignment</p>
                <StatusBadge
                  variant={STATUS_VARIANT[model.activeAssignment?.assignment_status] || "neutral"}
                  label={model.activeAssignment?.assignment_status || "unassigned"}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!model.activeAssignment && permissions?.canAssignPlan ? (
                <Button type="button" size="sm" onClick={() => handleAction("assign_plan")}>
                  Assign plan
                </Button>
              ) : null}
              {model.activeAssignment && permissions?.canChangePlan ? (
                <Button type="button" size="sm" variant="outline" onClick={() => handleAction("change_plan")}>
                  Change plan
                </Button>
              ) : null}
            </div>
          </section>
          <EnterpriseDataTable
            hasRows={(model.planHistory || []).length > 0}
            emptyTitle="No assignment history"
            emptyDescription="Plan assignments appear here after the first assignment."
            desktop={
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {["Plan", "Version", "From", "To", "Status", "Assigned by"].map((label) => (
                        <th key={label} className="px-2 py-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(model.planHistory || []).map((row) => (
                      <tr key={row.id} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-2">{row.planName}</td>
                        <td className="px-2 py-2">{row.version}</td>
                        <td className="px-2 py-2">{row.effectiveFromLabel}</td>
                        <td className="px-2 py-2">{row.effectiveToLabel}</td>
                        <td className="px-2 py-2">
                          <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                        </td>
                        <td className="px-2 py-2">{row.assignedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
        </div>
      ) : null}

      {!isCompact && visibleTab === "payroll" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Source: Payroll → Preview. Commission columns merge cash-only commission for each period.
          </p>
          <EnterpriseDataTable
            hasRows={workspace.payrollRows.length > 0}
            emptyTitle="No payroll history yet"
            emptyDescription="Generate a Payroll Preview to see salary and commission history."
            desktop={
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {[
                        "Period",
                        "Salary",
                        "Commission",
                        "Cash collected",
                        "Allowances",
                        "Adjustments",
                        "Net pay",
                        "Status",
                      ].map((label) => (
                        <th key={label} className="px-2 py-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.payrollRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-2 font-medium">{row.periodYm}</td>
                        <td className="px-2 py-2 tabular-nums">{row.salaryLabel}</td>
                        <td className="px-2 py-2 tabular-nums">{row.commissionLabel}</td>
                        <td className="px-2 py-2 tabular-nums">{row.collectedCashLabel}</td>
                        <td className="px-2 py-2 tabular-nums">{row.allowancesLabel}</td>
                        <td className="px-2 py-2 tabular-nums">{row.adjustmentsLabel}</td>
                        <td className="px-2 py-2 tabular-nums">{row.netPayLabel}</td>
                        <td className="px-2 py-2">
                          <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
          {(model.adjustments || []).length ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Adjustments</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {model.adjustments.slice(0, 8).map((row) => (
                  <li key={row.id}>
                    {row.category}: {row.amountLabel} — {row.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {!isCompact && visibleTab === "ownership" && ownershipContext ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Source: Business Ownership. These laboratories generate this employee&apos;s commission.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Territories</p>
              <p className="text-sm">{ownershipContext.territories}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Managed labs</p>
              <p className="text-sm">{ownershipContext.managedLabCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Attribution</p>
              <p className="text-sm">{ownershipContext.collectionAttributionLabel}</p>
            </div>
          </div>
          {ownershipContext.managedLabs?.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase">
                  <tr>
                    <th className="px-2 py-2">Lab</th>
                    <th className="px-2 py-2">Territory</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ownershipContext.managedLabs.map((lab) => (
                    <tr key={lab.labId} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-2">{lab.labName}</td>
                      <td className="px-2 py-2">{lab.territory}</td>
                      <td className="px-2 py-2 text-right">
                        <Button type="button" size="sm" variant="ghost" onClick={() => onAction?.("open_lab", { labId: lab.labId })}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {ownershipContext.potentialOverrideCompensation ? (
            <CompensationAttributionPreview preview={ownershipContext.potentialOverrideCompensation} compact />
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => handleAction("open_ownership")}>
            Open Ownership Explorer
          </Button>
        </div>
      ) : null}

      {!isCompact && visibleTab === "history" ? (
        <Employee360HistoryPanel history={workspace.history} />
      ) : null}
    </div>
  );
}
