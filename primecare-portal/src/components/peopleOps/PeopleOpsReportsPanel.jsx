import React from "react";
import { BarChart3, TrendingUp, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import ReportsExecutiveSummary from "@/components/peopleOps/ReportsExecutiveSummary.jsx";
import ExecutiveCompensationIntelligencePanel from "@/components/compensation/ExecutiveCompensationIntelligencePanel.jsx";
import ExecutivePerformancePanel from "@/components/compensation/ExecutivePerformancePanel.jsx";

function hasChartData(points = [], valueKey = "value") {
  return points.some((point) => Number(point[valueKey] ?? point.netPayroll ?? point.commission ?? point.efficiency ?? point.liability ?? 0) > 0);
}

function TrendBars({ points = [], valueKey = "netPayroll", labelKey = "label", emptyTitle, emptyDescription, emptyAction = null }) {
  if (!points.length || !hasChartData(points, valueKey)) {
    return (
      <EmptyState
        compact
        title={emptyTitle || "No payroll preview has been generated yet"}
        description={emptyDescription || "Generate payroll previews across periods to populate this chart."}
        action={emptyAction}
      />
    );
  }
  const max = Math.max(...points.map((point) => Number(point[valueKey] || 0)), 1);
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label="Trend chart">
      {points.map((point) => (
        <div key={point.periodYm || point.label} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <div
            className="w-full rounded-t bg-[var(--pc-brand-primary)]/80 transition-all duration-300"
            style={{ height: `${Math.max(4, (Number(point[valueKey] || 0) / max) * 100)}%` }}
            title={`${point[labelKey]}: ${point.netPayrollLabel || point.commissionLabel || point.efficiencyLabel || point.liabilityLabel || point[valueKey]}`}
          />
          <span className="truncate text-[9px] text-muted-foreground">{point[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

function RankList({ rows = [], valueKey = "netPayableLabel", emptyAction = null }) {
  if (!rows.length) {
    return (
      <EmptyState
        compact
        title="No promotion candidates yet"
        description="Promotion eligibility appears after a Payroll Preview is generated."
        action={emptyAction}
      />
    );
  }
  return (
    <div className="space-y-1">
      {rows.map((row, index) => (
        <div key={row.agentId} className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <div>
            <p className="font-semibold text-foreground">#{index + 1} {row.agentName}</p>
            <p className="text-[10px] text-muted-foreground">Commission {row.commissionLabel || "—"}</p>
          </div>
          <p className="font-semibold tabular-nums text-[var(--pc-brand-primary)]">{row[valueKey]}</p>
        </div>
      ))}
    </div>
  );
}

export default function PeopleOpsReportsPanel({
  model,
  intelligence,
  executivePerformance,
  compensationPlans = [],
  breadcrumbs = [],
  onNavigatePayroll,
}) {
  if (!model || !intelligence) return null;

  const payrollAction = onNavigatePayroll ? (
    <Button type="button" size="sm" variant="default" className="h-7 text-[10px]" onClick={onNavigatePayroll}>
      Open Payroll
    </Button>
  ) : null;

  const hasAnyTrend =
    hasChartData(model.charts.payrollTrend, "netPayroll") ||
    hasChartData(model.charts.commissionTrend, "commission");

  return (
    <PeopleOpsModuleFrame
      title="Analytics & Reports"
      description="Business summary first — then trends and rankings. Read-only."
      breadcrumbs={breadcrumbs}
      helpModuleId="reports"
      dense
      summary={<ReportsExecutiveSummary model={model} executivePerformance={executivePerformance} />}
    >
      {hasAnyTrend ? (
        <div className="grid gap-1.5 xl:grid-cols-2">
          <PeopleOpsSectionCard title="Payroll Trend" subtitle="Net payroll by period" icon={BarChart3} dense>
            <TrendBars
              points={model.charts.payrollTrend}
              valueKey="netPayroll"
              emptyTitle="No payroll preview has been generated yet"
              emptyAction={payrollAction}
            />
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Commission Trend" subtitle="Commission totals by period" icon={TrendingUp} dense>
            <TrendBars points={model.charts.commissionTrend} valueKey="commission" emptyAction={payrollAction} />
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Collection Trend" subtitle="Collection efficiency by period" icon={TrendingUp} dense>
            <TrendBars points={model.charts.collectionTrend} valueKey="efficiency" emptyAction={payrollAction} />
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Payroll Liability Trend" subtitle="Liability trajectory" icon={Wallet} dense>
            <TrendBars points={model.charts.liabilityTrend} valueKey="liability" emptyAction={payrollAction} />
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Promotion Pipeline" subtitle="Promotion eligibility" icon={Users} dense className="xl:col-span-2">
            <RankList
              rows={model.charts.promotionPipeline.map((row) => ({
                ...row,
                netPayableLabel: row.eligible ? "Eligible" : row.status,
                commissionLabel: `${row.efficiencyPct}% efficiency`,
              }))}
              valueKey="netPayableLabel"
              emptyAction={payrollAction}
            />
          </PeopleOpsSectionCard>
        </div>
      ) : (
        <EmptyState
          compact
          title="No payroll generated yet."
          description="Generate a Payroll Preview across periods to unlock trend charts and rankings."
          action={payrollAction}
        />
      )}

      <ExecutivePerformancePanel performance={executivePerformance} />
      <ExecutiveCompensationIntelligencePanel intelligence={intelligence} compensationPlans={compensationPlans} />
    </PeopleOpsModuleFrame>
  );
}
