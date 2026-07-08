import React from "react";
import { Activity, CheckCircle2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnterpriseMetricStrip } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsQuickActions from "@/components/peopleOps/productivity/PeopleOpsQuickActions.jsx";
import PeopleOpsWorkInbox from "@/components/peopleOps/productivity/PeopleOpsWorkInbox.jsx";
import PeopleOpsRecentActivity from "@/components/peopleOps/productivity/PeopleOpsRecentActivity.jsx";
import PeopleOpsWorkflowProgress from "@/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx";
import PeopleOpsDataQualityBanner from "@/components/peopleOps/PeopleOpsDataQualityBanner.jsx";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";
import {
  buildDashboardPayrollCard,
  buildDashboardPendingActions,
} from "@/peopleOps/peopleOpsEnterpriseModel.js";

export default function PeopleOpsDashboard({
  model,
  breadcrumbs = [],
  employeeCount = 0,
  productivity,
  onQuickAction,
  onOpenRoute,
  onNavigatePayroll,
  onNavigateEmployees,
  dataQualityWarnings = [],
  workflowBusy = false,
  refreshing = false,
}) {
  const inboxCount = productivity?.approvalInbox?.length || 0;
  const notificationCount = (productivity?.notifications || []).filter((row) => !row.disabled).length;
  const payrollCard = buildDashboardPayrollCard(model.reportingContext, model.kpis);
  const pending = buildDashboardPendingActions(productivity);
  const liabilityLabel = formatPeopleOpsMetricValue(model.kpis.currentPayrollLiabilityLabel, {
    emptyLabel: "Not configured",
  });

  return (
    <PeopleOpsModuleFrame
      title="People Operations"
      description="Executive workspace — action, activity, and payroll operations."
      breadcrumbs={breadcrumbs}
      dense
      summary={
        <EnterpriseMetricStrip
          refreshing={refreshing}
          items={[
            { id: "payroll", label: payrollCard.title, value: payrollCard.value, hint: payrollCard.subtitle },
            { id: "liability", label: "Payroll liability", value: liabilityLabel },
            { id: "inbox", label: "Work inbox", value: String(inboxCount + notificationCount), hint: inboxCount ? "Needs action" : "Clear" },
            { id: "employees", label: "Employees", value: String(employeeCount) },
            { id: "pending", label: "Pending", value: String(pending.count) },
            { id: "run", label: "In run", value: formatPeopleOpsMetricValue(model.kpis.employeeCount, { emptyLabel: "None" }) },
          ]}
        />
      }
    >
      <PeopleOpsDataQualityBanner warnings={dataQualityWarnings} onNavigate={(route) => onOpenRoute?.(route)} />
      <PeopleOpsQuickActions actions={productivity?.quickActions || []} onAction={onQuickAction} busy={workflowBusy} />

      <PeopleOpsWorkInbox
        approvalItems={productivity?.approvalInbox || []}
        notifications={productivity?.notifications || []}
        onOpenItem={(route, item) => onOpenRoute?.(route, item)}
      />

      <PeopleOpsWorkflowProgress stages={productivity?.workflowProgress || []} compact />

      <PeopleOpsRecentActivity items={productivity?.recentActivity || []} />

      <PeopleOpsSectionCard title="Operational Timeline" subtitle="Workforce and payroll snapshot" icon={Activity} dense>
        <div className="grid gap-1.5 lg:grid-cols-2">
          <dl className="grid grid-cols-2 gap-1 text-xs">
            {[
              ["Directory", employeeCount],
              ["In run", formatPeopleOpsMetricValue(model.kpis.employeeCount, { emptyLabel: "None in version" })],
              ["Paid evidence", model.kpis.paidEvidenceRuns || "None"],
              ["Commission", model.kpis.commissionPayableLabel || "Not configured"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-background px-2 py-1">
                <dt className="text-[10px] text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div>
            {pending.items.length ? (
              <ul className="space-y-1 text-xs">
                {pending.items.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)]"
                      onClick={() => onOpenRoute?.(item.route, item)}
                    >
                      <p className="font-medium">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{item.subtitle}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No pending payroll actions for the selected context.</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onNavigatePayroll}>
                Open Payroll
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onNavigateEmployees}>
                <Users className="mr-1 h-3 w-3" />
                Employees
              </Button>
            </div>
          </div>
        </div>
      </PeopleOpsSectionCard>
    </PeopleOpsModuleFrame>
  );
}
