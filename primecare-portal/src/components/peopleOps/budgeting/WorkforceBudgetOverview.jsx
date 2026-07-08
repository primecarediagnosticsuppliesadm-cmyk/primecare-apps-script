import React from "react";
import { BarChart3, Briefcase, Target, TrendingUp, Users, Wallet } from "lucide-react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { WorkforceBudgetBarChart, WorkforceBudgetCompareChart } from "@/components/peopleOps/budgeting/WorkforceBudgetCharts.jsx";

export default function WorkforceBudgetOverview({ workspace, breadcrumbs = [] }) {
  if (!workspace) return null;
  const { overview, charts, envelope } = workspace;

  return (
    <PeopleOpsModuleFrame
      title="Budget Overview"
      description={`Workforce planning envelope for ${overview.periodLabel}. Preview-only — does not mutate payroll or finance.`}
      breadcrumbs={breadcrumbs}
      summary={
        <KpiCardGrid columns={3}>
          <KpiCard title="Approved Budget" value={overview.approvedBudgetLabel} subtitle="Derived planning envelope (+25% headroom)" icon={Wallet} />
          <KpiCard title="Current Payroll" value={overview.currentPayrollLabel} subtitle="Selected reporting run" icon={TrendingUp} />
          <KpiCard title="Projected Payroll" value={overview.projectedPayrollLabel} subtitle="Forecast scenario peak" icon={BarChart3} />
          <KpiCard title="Remaining Budget" value={overview.remainingBudgetLabel} subtitle="Envelope minus projection" icon={Target} />
          <KpiCard title="Payroll %" value={overview.payrollPctLabel} subtitle={`Revenue ratio ${overview.payrollPctRevenueLabel}`} icon={Briefcase} />
          <KpiCard title="Headcount" value={String(overview.headcount)} subtitle={`${overview.openPositions} open positions`} icon={Users} />
          <KpiCard title="Variance" value={overview.varianceLabel} subtitle="Envelope minus current payroll" icon={Wallet} />
        </KpiCardGrid>
      }
    >
      <p className="text-sm text-muted-foreground">
        Planning envelope is derived from the current reporting-context payroll with {envelope.headroomPct}% executive headroom.
        No payroll generation, finance mutations, or persistence occurs in this module.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <PeopleOpsSectionCard title="Monthly Payroll" subtitle="Net payroll by period (latest run per period)" icon={BarChart3}>
          <WorkforceBudgetBarChart points={charts.monthlyPayroll} ariaLabel="Monthly payroll trend" />
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Budget vs Actual" subtitle="Planning envelope compared to actual payroll" icon={TrendingUp}>
          <WorkforceBudgetCompareChart points={charts.budgetVsActual} />
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Headcount Trend" subtitle="Estimated headcount trajectory" icon={Users}>
          <WorkforceBudgetBarChart points={charts.headcountTrend} ariaLabel="Headcount trend" />
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Department Allocation" subtitle="Current payroll by department" icon={Briefcase}>
          <WorkforceBudgetBarChart points={charts.departmentAllocation} ariaLabel="Department allocation" />
        </PeopleOpsSectionCard>
      </div>
    </PeopleOpsModuleFrame>
  );
}
