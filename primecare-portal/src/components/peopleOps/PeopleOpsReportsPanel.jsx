import React from "react";
import { BarChart3, TrendingUp, Users, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import ExecutiveCompensationIntelligencePanel from "@/components/compensation/ExecutiveCompensationIntelligencePanel.jsx";

function TrendBars({ points = [], valueKey = "netPayroll", labelKey = "label" }) {
  const max = Math.max(...points.map((point) => Number(point[valueKey] || 0)), 1);
  if (!points.length) {
    return (
      <EmptyState
        title="No trend data yet"
        description="Payroll trends appear after preview runs are generated across periods."
      />
    );
  }
  return (
    <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Payroll trend chart">
      {points.map((point) => (
        <div key={point.periodYm || point.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-[var(--pc-brand-primary)]/80"
            style={{ height: `${Math.max(6, (Number(point[valueKey] || 0) / max) * 100)}%` }}
            title={`${point[labelKey]}: ${point.netPayrollLabel || point.commissionLabel || point.efficiencyLabel || point.liabilityLabel || point[valueKey]}`}
          />
          <span className="truncate text-[10px] text-muted-foreground">{point[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

function RankList({ rows = [], valueKey = "netPayableLabel" }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No promotion pipeline data"
        description="Agent promotion eligibility appears after payroll preview calculations."
      />
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.agentId} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <div>
            <p className="font-semibold text-foreground">
              #{index + 1} {row.agentName}
            </p>
            <p className="text-xs text-muted-foreground">Commission {row.commissionLabel || "—"}</p>
          </div>
          <p className="font-semibold tabular-nums text-[var(--pc-brand-primary)]">{row[valueKey]}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Analytical reports surface — ratios, rankings, territory, forecast, and trend charts.
 */
export default function PeopleOpsReportsPanel({ model, intelligence, compensationPlans = [], breadcrumbs = [] }) {
  if (!model || !intelligence) return null;

  return (
    <PeopleOpsModuleFrame
      title="Analytics & Reports"
      description="Payroll trends, ratios, rankings, territory performance, and forecast scenarios. Read-only — no workflow actions."
      breadcrumbs={breadcrumbs}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <PeopleOpsSectionCard title="Payroll Trend" subtitle="Net payroll by period (latest run per period)" icon={BarChart3}>
          <TrendBars points={model.charts.payrollTrend} valueKey="netPayroll" />
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Commission Trend" subtitle="Commission totals by period" icon={TrendingUp}>
          <TrendBars points={model.charts.commissionTrend} valueKey="commission" />
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Collection Trend" subtitle="Collection efficiency by period" icon={TrendingUp}>
          <TrendBars points={model.charts.collectionTrend} valueKey="efficiency" />
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Payroll Liability Trend" subtitle="Liability trajectory by period" icon={Wallet}>
          <TrendBars points={model.charts.liabilityTrend} valueKey="liability" />
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard
          title="Promotion Pipeline"
          subtitle="Agents approaching promotion eligibility"
          icon={Users}
          className="xl:col-span-2"
        >
          <RankList
            rows={model.charts.promotionPipeline.map((row) => ({
              ...row,
              netPayableLabel: row.eligible ? "Eligible" : row.status,
              commissionLabel: `${row.efficiencyPct}% efficiency`,
            }))}
            valueKey="netPayableLabel"
          />
        </PeopleOpsSectionCard>
      </div>

      <ExecutiveCompensationIntelligencePanel intelligence={intelligence} compensationPlans={compensationPlans} />
    </PeopleOpsModuleFrame>
  );
}
