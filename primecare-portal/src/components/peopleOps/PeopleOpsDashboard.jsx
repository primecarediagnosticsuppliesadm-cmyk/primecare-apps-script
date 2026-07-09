import React, { useMemo } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnterpriseMetricStrip } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsQuickActions from "@/components/peopleOps/productivity/PeopleOpsQuickActions.jsx";
import PeopleOpsWorkInbox from "@/components/peopleOps/productivity/PeopleOpsWorkInbox.jsx";
import PeopleOpsRecentActivity from "@/components/peopleOps/productivity/PeopleOpsRecentActivity.jsx";
import PeopleOpsWorkflowProgress from "@/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx";
import PeopleOpsFounderDayBoard from "@/components/peopleOps/productivity/PeopleOpsFounderDayBoard.jsx";
import PeopleOpsDataQualityBanner from "@/components/peopleOps/PeopleOpsDataQualityBanner.jsx";
import PeopleOpsGuidedOnboarding from "@/components/peopleOps/PeopleOpsGuidedOnboarding.jsx";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";
import {
  buildDashboardPayrollCard,
  buildDashboardPendingActions,
} from "@/peopleOps/peopleOpsEnterpriseModel.js";
import { buildFounderDayBoard } from "@/peopleOps/productivity/peopleOpsFounderDayBoard.js";
import { getPayrollCycleCopy } from "@/peopleOps/peopleOpsBusinessCopy.js";

export default function PeopleOpsDashboard({
  model,
  breadcrumbs = [],
  employeeCount = 0,
  employeeList = [],
  ownershipWorkspace = null,
  productivity,
  onQuickAction,
  onOpenRoute,
  onNavigatePayroll,
  onNavigateEmployees,
  dataQualityWarnings = [],
  workflowBusy = false,
  refreshing = false,
  selectedPeriodRow = null,
}) {
  const inboxCount = productivity?.approvalInbox?.length || 0;
  const notificationCount = (productivity?.notifications || []).filter((row) => !row.disabled).length;
  const payrollCard = buildDashboardPayrollCard(model.reportingContext, model.kpis);
  const pending = buildDashboardPendingActions(productivity);
  const liabilityLabel = formatPeopleOpsMetricValue(model.kpis.currentPayrollLiabilityLabel, {
    emptyLabel: "Not configured",
  });
  const periodLabel =
    selectedPeriodRow?.periodYm || model.reportingContext?.periodLabel || payrollCard.subtitle || "This period";
  const payrollStatus = selectedPeriodRow?.status || model.reportingContext?.status || "draft";
  const cycle = getPayrollCycleCopy(payrollStatus);

  const dayBoard = useMemo(
    () =>
      buildFounderDayBoard({
        employeeList,
        ownershipWorkspace,
        model,
        selectedPeriodRow,
        recentActivity: productivity?.recentActivity || [],
        dataQualityWarnings,
      }),
    [employeeList, ownershipWorkspace, model, selectedPeriodRow, productivity?.recentActivity, dataQualityWarnings]
  );

  const handleCycleAction = () => {
    const screen = cycle.actionScreen || "periods";
    onOpenRoute?.({
      moduleId: "payroll",
      screenId: screen,
      periodId: selectedPeriodRow?.periodId || model.reportingContext?.periodId,
      runId: selectedPeriodRow?.runId || model.reportingContext?.payrollRunId,
    });
  };

  return (
    <PeopleOpsModuleFrame
      title="People Operations"
      description="What needs attention today, where payroll stands, and what changed."
      breadcrumbs={breadcrumbs}
      helpModuleId="dashboard"
      dense
      summary={
        <EnterpriseMetricStrip
          refreshing={refreshing}
          items={[
            { id: "payroll", label: "Where are we in payroll?", value: payrollCard.value, hint: periodLabel },
            { id: "liability", label: "Payroll liability", value: liabilityLabel },
            {
              id: "inbox",
              label: "Requires your attention",
              value: String(inboxCount + notificationCount),
              hint: inboxCount ? "Needs action" : "Clear",
            },
            { id: "employees", label: "Employees", value: String(employeeCount) },
            { id: "pending", label: "Pending decisions", value: String(pending.count) },
            {
              id: "run",
              label: "In this payroll",
              value: formatPeopleOpsMetricValue(model.kpis.employeeCount, { emptyLabel: "None" }),
            },
          ]}
        />
      }
    >
      <PeopleOpsGuidedOnboarding onNavigate={(route) => onOpenRoute?.(route)} />
      <PeopleOpsDataQualityBanner warnings={dataQualityWarnings} onNavigate={(route) => onOpenRoute?.(route)} />

      <PeopleOpsFounderDayBoard dayBoard={dayBoard} onOpenRoute={onOpenRoute} />

      <PeopleOpsQuickActions actions={productivity?.quickActions || []} onAction={onQuickAction} busy={workflowBusy} />

      <PeopleOpsWorkInbox
        approvalItems={productivity?.approvalInbox || []}
        notifications={productivity?.notifications || []}
        onOpenItem={(route, item) => onOpenRoute?.(route, item)}
      />

      <PeopleOpsWorkflowProgress
        stages={productivity?.workflowProgress || []}
        compact
        periodLabel={periodLabel}
        status={payrollStatus}
        onPrimaryAction={handleCycleAction}
        showFounderCard
      />

      <PeopleOpsRecentActivity
        items={productivity?.recentActivity || []}
        onOpenItem={(route, item) => onOpenRoute?.(route, item)}
      />

      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={onNavigatePayroll}>
          Open Payroll
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={onNavigateEmployees}>
          <Users className="mr-1 h-3 w-3" />
          Employees
        </Button>
      </div>
    </PeopleOpsModuleFrame>
  );
}
