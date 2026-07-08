import React from "react";
import { BarChart3, Briefcase, Target, TrendingUp, Users, Wallet } from "lucide-react";
import { KpiCard, KpiCardGrid, StatusBadge } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { WorkforceBudgetBarChart, WorkforceBudgetCompareChart } from "@/components/peopleOps/budgeting/WorkforceBudgetCharts.jsx";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";

export default function WorkforceBudgetOverview({ workspace, breadcrumbs = [] }) {
  if (!workspace) return null;
  const { overview, charts, envelope } = workspace;
  const isConfigured = overview.currentPayroll > 0;
  const hasChartData =
    (charts.monthlyPayroll || []).some((row) => Number(row.value) > 0) ||
    (charts.budgetVsActual || []).some((row) => Number(row.actual) > 0);

  return (
    <PeopleOpsModuleFrame
      title="Budget Overview"
      description={`Workforce planning envelope for ${overview.periodLabel}. Preview-only — does not mutate payroll or finance.`}
      breadcrumbs={breadcrumbs}
      summary={
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={isConfigured ? "success" : "warning"} label={isConfigured ? "Configured (derived envelope)" : "Not configured"} />
            <span className="text-xs text-muted-foreground">
              {isConfigured
                ? `Derived from current payroll with ${envelope.headroomPct}% headroom`
                : "Generate a payroll preview to derive the planning envelope"}
            </span>
          </div>
          <KpiCardGrid columns={3} dense>
            <KpiCard dense title="Approved Budget" value={isConfigured ? overview.approvedBudgetLabel : "Budget not configured"} subtitle="Derived planning envelope (+25% headroom)" icon={Wallet} />
            <KpiCard dense title="Current Payroll" value={formatPeopleOpsMetricValue(overview.currentPayrollLabel, { emptyLabel: "Budget not configured" })} subtitle="Selected reporting run" icon={TrendingUp} />
            <KpiCard dense title="Projected Payroll" value={formatPeopleOpsMetricValue(overview.projectedPayrollLabel, { emptyLabel: "No forecast" })} subtitle="Forecast scenario peak" icon={BarChart3} />
            <KpiCard dense title="Remaining Budget" value={formatPeopleOpsMetricValue(overview.remainingBudgetLabel, { emptyLabel: "Not available" })} subtitle="Envelope minus projection" icon={Target} />
            <KpiCard dense title="Payroll %" value={isConfigured ? overview.payrollPctLabel : "Not configured"} subtitle={`Revenue ratio ${overview.payrollPctRevenueLabel || "—"}`} icon={Briefcase} />
            <KpiCard dense title="Headcount" value={overview.headcount ? String(overview.headcount) : "None in run"} subtitle={`${overview.openPositions} open positions`} icon={Users} />
            <KpiCard dense title="Variance" value={formatPeopleOpsMetricValue(overview.varianceLabel, { emptyLabel: "Not available" })} subtitle="Envelope minus current payroll" icon={Wallet} />
          </KpiCardGrid>
        </div>
      }
    >
      {hasChartData ? (
        <div className="grid gap-2 xl:grid-cols-2">
          <PeopleOpsSectionCard title="Monthly Payroll" subtitle="Net payroll by period (latest run per period)" icon={BarChart3}>
            <WorkforceBudgetBarChart points={charts.monthlyPayroll} ariaLabel="Monthly payroll trend" />
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Budget vs Actual" subtitle="Planning envelope compared to actual payroll" icon={TrendingUp}>
            <WorkforceBudgetCompareChart points={charts.budgetVsActual} />
          </PeopleOpsSectionCard>
          {(charts.headcountTrend || []).length ? (
            <PeopleOpsSectionCard title="Headcount Trend" subtitle="Estimated headcount trajectory" icon={Users}>
              <WorkforceBudgetBarChart points={charts.headcountTrend} ariaLabel="Headcount trend" />
            </PeopleOpsSectionCard>
          ) : null}
          {(charts.departmentAllocation || []).length ? (
            <PeopleOpsSectionCard title="Department Allocation" subtitle="Current payroll by department" icon={Briefcase}>
              <WorkforceBudgetBarChart points={charts.departmentAllocation} ariaLabel="Department allocation" />
            </PeopleOpsSectionCard>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
          Charts appear after payroll preview data is available for multiple periods. KPIs above reflect the current reporting context.
        </p>
      )}
    </PeopleOpsModuleFrame>
  );
}
