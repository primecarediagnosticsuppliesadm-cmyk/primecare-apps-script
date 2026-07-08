import React from "react";
import {
  CheckCircle2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, EnterpriseMetricStrip } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsQuickActions from "@/components/peopleOps/productivity/PeopleOpsQuickActions.jsx";
import PeopleOpsApprovalInbox from "@/components/peopleOps/productivity/PeopleOpsApprovalInbox.jsx";
import PeopleOpsNotificationsPanel from "@/components/peopleOps/productivity/PeopleOpsNotificationsPanel.jsx";
import PeopleOpsRecentActivity from "@/components/peopleOps/productivity/PeopleOpsRecentActivity.jsx";
import PeopleOpsRecentlyViewed from "@/components/peopleOps/productivity/PeopleOpsRecentlyViewed.jsx";
import PeopleOpsFavorites from "@/components/peopleOps/productivity/PeopleOpsFavorites.jsx";
import PeopleOpsWorkflowProgress from "@/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx";
import { PEOPLE_OPS_PAYROLL_STATUS_VARIANT } from "@/components/peopleOps/peopleOpsStatusTokens.js";
import {
  buildDashboardPayrollCard,
  buildDashboardPendingActions,
} from "@/peopleOps/peopleOpsEnterpriseModel.js";

function ReportingContextToolbar({
  context,
  periodOptions = [],
  runOptions = [],
  selectedPeriodId,
  selectedRunId,
  onPeriodChange,
  onRunChange,
  lastRefreshLabel,
}) {
  if (!context) return null;
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
      <label className="min-w-[8rem] flex-1 space-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Period</span>
        <select
          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
          value={selectedPeriodId || context.periodId || ""}
          onChange={(event) => onPeriodChange?.(event.target.value)}
        >
          {periodOptions.map((row) => (
            <option key={row.periodId} value={row.periodId}>
              {row.periodYm}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-[8rem] flex-1 space-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Version</span>
        <select
          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
          value={selectedRunId || context.payrollRunId || ""}
          onChange={(event) => onRunChange?.(event.target.value)}
          disabled={!runOptions.length}
        >
          {runOptions.map((row) => (
            <option key={row.runId} value={row.runId}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <div className="text-xs text-muted-foreground">
        <StatusBadge variant={PEOPLE_OPS_PAYROLL_STATUS_VARIANT[context.status] || "neutral"} label={context.statusLabel} />
        {lastRefreshLabel ? <span className="ml-2">· {lastRefreshLabel}</span> : null}
      </div>
    </div>
  );
}

export default function PeopleOpsDashboard({
  model,
  breadcrumbs = [],
  employeeCount = 0,
  periodOptions = [],
  runOptions = [],
  selectedPeriodId,
  selectedRunId,
  onPeriodChange,
  onRunChange,
  onNavigatePayroll,
  onNavigateEmployees,
  productivity,
  onQuickAction,
  onOpenRoute,
  recentlyViewed = [],
  favorites = [],
  workflowBusy = false,
  lastRefreshLabel = "",
}) {
  const inboxCount = productivity?.approvalInbox?.length || 0;
  const notificationCount = (productivity?.notifications || []).filter((row) => !row.disabled).length;
  const payrollCard = buildDashboardPayrollCard(model.reportingContext, model.kpis);
  const pending = buildDashboardPendingActions(productivity);

  return (
    <PeopleOpsModuleFrame
      title="People Operations"
      description="Operational workspace — payroll actions, directory, and pending work."
      breadcrumbs={breadcrumbs}
      summary={
        <EnterpriseMetricStrip
          items={[
            { id: "payroll", label: payrollCard.title, value: payrollCard.value, hint: payrollCard.subtitle },
            { id: "liability", label: "Payroll liability", value: model.kpis.currentPayrollLiabilityLabel },
            { id: "inbox", label: "Approvals", value: String(inboxCount), hint: inboxCount ? "Needs action" : "Clear" },
            { id: "employees", label: "Employees", value: String(employeeCount) },
            { id: "pending", label: "Pending", value: String(pending.count) },
            { id: "alerts", label: "Notifications", value: String(notificationCount) },
          ]}
        />
      }
    >
      <PeopleOpsQuickActions actions={productivity?.quickActions || []} onAction={onQuickAction} busy={workflowBusy} />

      <ReportingContextToolbar
        context={model.reportingContext}
        periodOptions={periodOptions}
        runOptions={runOptions}
        selectedPeriodId={selectedPeriodId}
        selectedRunId={selectedRunId}
        onPeriodChange={onPeriodChange}
        onRunChange={onRunChange}
        lastRefreshLabel={lastRefreshLabel}
      />

      <PeopleOpsWorkflowProgress stages={productivity?.workflowProgress || []} />

      <div className="grid gap-3 xl:grid-cols-2">
        <PeopleOpsApprovalInbox items={productivity?.approvalInbox || []} onOpenItem={(item) => onOpenRoute?.(item.route, item)} />
        <PeopleOpsNotificationsPanel
          notifications={productivity?.notifications || []}
          onOpenNotification={(item) => onOpenRoute?.(item.route, item)}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <PeopleOpsFavorites items={favorites} onOpenItem={(item) => onOpenRoute?.(item.route, item)} />
        <PeopleOpsRecentlyViewed items={recentlyViewed} onOpenItem={(item) => onOpenRoute?.(item.route, item)} />
      </div>

      <PeopleOpsRecentActivity items={productivity?.recentActivity || []} />

      <div className="grid gap-3 lg:grid-cols-2">
        <PeopleOpsSectionCard
          title="Workforce Snapshot"
          subtitle="Directory and payroll evidence for the selected run"
          icon={Users}
          rightAction={
            <Button type="button" size="sm" variant="outline" onClick={onNavigateEmployees}>
              View Employees
            </Button>
          }
        >
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">Directory count</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{employeeCount}</dd>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">Employees in run</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{model.kpis.employeeCount}</dd>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">Paid evidence runs</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{model.kpis.paidEvidenceRuns}</dd>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">Commission payable</dt>
              <dd className="mt-1 text-lg font-semibold">{model.kpis.commissionPayableLabel}</dd>
            </div>
          </dl>
        </PeopleOpsSectionCard>

        <PeopleOpsSectionCard
          title="Payroll Operations"
          subtitle="Jump into the current payroll cycle"
          icon={CheckCircle2}
          rightAction={
            <Button type="button" size="sm" variant="outline" onClick={onNavigatePayroll}>
              Open Payroll
            </Button>
          }
        >
          {pending.items.length ? (
            <ul className="space-y-2 text-sm">
              {pending.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted/40"
                    onClick={() => onOpenRoute?.(item.route, item)}
                  >
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No pending payroll actions for the selected reporting context. Use Quick Actions when a new cycle begins.
            </p>
          )}
        </PeopleOpsSectionCard>
      </div>
    </PeopleOpsModuleFrame>
  );
}
