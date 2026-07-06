import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import {
  buildNewHireForecast,
  RANKING_SORT_KEYS,
  sortRankingRows,
} from "@/compensation/compensationIntelligenceEngine.js";
import { BarChart3, IndianRupee, TrendingUp, Users, Wallet } from "lucide-react";

function SectionCard({ title, icon: Icon, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-slate-50/80 p-4 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-4 w-4 text-indigo-600" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

const SORT_LABELS = {
  collections: "Collections",
  revenue: "Revenue",
  commission: "Commission",
  collectionEfficiency: "Collection Efficiency",
  payrollCost: "Payroll Cost",
};

export default function ExecutiveCompensationIntelligencePanel({ intelligence, compensationPlans = [] }) {
  const [rankSortKey, setRankSortKey] = useState("collections");
  const [rankDirection, setRankDirection] = useState("desc");
  const [rankView, setRankView] = useState("top");
  const [hireCount, setHireCount] = useState(intelligence?.newHireDefaults?.hireCount || 1);
  const [hirePlanId, setHirePlanId] = useState(intelligence?.newHireDefaults?.planId || "");

  const rankedRows = useMemo(() => {
    const rows = intelligence?.rankings?.agentRows || [];
    const sorted = sortRankingRows(rows, rankSortKey, rankDirection);
    if (rankView === "bottom") return [...sorted].reverse().slice(0, 8);
    return sorted.slice(0, 8);
  }, [intelligence, rankSortKey, rankDirection, rankView]);

  const selectedPlan = useMemo(
    () => (compensationPlans || []).find((plan) => plan.id === hirePlanId) || compensationPlans[0] || null,
    [compensationPlans, hirePlanId]
  );

  const newHireForecast = useMemo(
    () =>
      buildNewHireForecast({
        hireCount,
        plan: selectedPlan,
        averageCommissionPerAgent: intelligence?.ratios?.commissionPerAgent || 0,
      }),
    [hireCount, selectedPlan, intelligence]
  );

  if (!intelligence) return null;

  const { ratios, territoryRows, forecast } = intelligence;

  return (
    <div className="space-y-4">
      <KpiCardGrid>
        <KpiCard title="Payroll % Revenue" value={ratios.payrollPctRevenueLabel} icon={IndianRupee} />
        <KpiCard title="Payroll % Collections" value={ratios.payrollPctCollectionsLabel} icon={Wallet} />
        <KpiCard title="Revenue per Agent" value={ratios.revenuePerAgentLabel} icon={TrendingUp} />
        <KpiCard title="Collections per Agent" value={ratios.collectionsPerAgentLabel} icon={TrendingUp} />
        <KpiCard title="Commission per Agent" value={ratios.commissionPerAgentLabel} icon={IndianRupee} />
      </KpiCardGrid>

      <SectionCard title="Unified Agent Rankings" icon={Users}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border bg-white px-2 py-1 text-xs"
            value={rankSortKey}
            onChange={(event) => setRankSortKey(event.target.value)}
          >
            {RANKING_SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                Sort: {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant={rankView === "top" ? "default" : "outline"}
            onClick={() => setRankView("top")}
          >
            Top performers
          </Button>
          <Button
            type="button"
            size="sm"
            variant={rankView === "bottom" ? "default" : "outline"}
            onClick={() => setRankView("bottom")}
          >
            Bottom performers
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRankDirection((dir) => (dir === "desc" ? "asc" : "desc"))}
          >
            {rankDirection === "desc" ? "Descending" : "Ascending"}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-left text-[11px]">
            <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {["#", "Agent", "Territory", "Collections", "Revenue", "Commission", "Efficiency", "Payroll"].map(
                  (label) => (
                    <th key={label} className="px-2 py-2">
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rankedRows.length ? (
                rankedRows.map((row, index) => (
                  <tr key={row.agentId} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2">{index + 1}</td>
                    <td className="px-2 py-2 font-medium text-slate-900">{row.agentName}</td>
                    <td className="px-2 py-2">{row.territory}</td>
                    <td className="px-2 py-2 tabular-nums">{row.collectionsLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.revenueLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.commissionLabel}</td>
                    <td className="px-2 py-2">{row.collectionEfficiencyLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.payrollCostLabel}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-slate-500">
                    No agent ranking data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Territory Compensation Performance" icon={BarChart3}>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-left text-[11px]">
            <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {[
                  "Territory",
                  "Agents",
                  "Collections",
                  "Revenue",
                  "Commission",
                  "Payroll",
                  "Efficiency",
                  "Payroll % Revenue",
                  "Payroll % Collections",
                ].map((label) => (
                  <th key={label} className="px-2 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {territoryRows?.length ? (
                territoryRows.map((row) => (
                  <tr key={row.territory} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2 font-medium">{row.territory}</td>
                    <td className="px-2 py-2">{row.agentCount}</td>
                    <td className="px-2 py-2 tabular-nums">{row.collectionsLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.revenueLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.commissionLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.payrollCostLabel}</td>
                    <td className="px-2 py-2">{row.collectionEfficiencyLabel}</td>
                    <td className="px-2 py-2">{row.payrollPctRevenueLabel}</td>
                    <td className="px-2 py-2">{row.payrollPctCollectionsLabel}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-2 py-4 text-slate-500">
                    No territory compensation data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Forward Payroll Forecast" icon={TrendingUp}>
          <p className="mb-3 text-xs text-slate-500">
            Read-only scenario preview for {ratios.periodYm}. Baseline payroll {forecast.baselinePayrollLabel}.
            No writes.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    "Scenario",
                    "Projected Payroll",
                    "Commission",
                    "Payroll % Revenue",
                    "Payroll % Collections",
                    "Incremental Cost",
                  ].map((label) => (
                    <th key={label} className="px-2 py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(forecast.scenarios || []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2 font-medium">{row.label}</td>
                    <td className="px-2 py-2 tabular-nums">{row.projectedPayrollLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.projectedCommissionLabel}</td>
                    <td className="px-2 py-2">{row.payrollPctRevenueLabel}</td>
                    <td className="px-2 py-2">{row.payrollPctCollectionsLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.incrementalCostLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="New Hire Forecast" icon={Users}>
          <p className="mb-3 text-xs text-slate-500">Preview-only projected payroll increase. No assignments created.</p>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-semibold uppercase tracking-wide text-slate-500">Number of hires</span>
              <Input
                type="number"
                min={0}
                value={hireCount}
                onChange={(event) => setHireCount(Number(event.target.value) || 0)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold uppercase tracking-wide text-slate-500">Compensation plan</span>
              <select
                className="h-9 w-full rounded-md border bg-white px-2 text-xs"
                value={selectedPlan?.id || ""}
                onChange={(event) => setHirePlanId(event.target.value)}
              >
                {(compensationPlans || []).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.plan_code} {plan.version}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-2 rounded-lg border bg-white p-3 text-xs md:grid-cols-2">
            <p>
              Fixed per hire: <strong>{newHireForecast.fixedPerHireLabel}</strong>
            </p>
            <p>
              Est. commission per hire: <strong>{newHireForecast.commissionPerHireLabel}</strong>
            </p>
            <p>
              Projected fixed increase: <strong>{newHireForecast.projectedFixedIncreaseLabel}</strong>
            </p>
            <p>
              Projected commission increase: <strong>{newHireForecast.projectedCommissionIncreaseLabel}</strong>
            </p>
            <p className="md:col-span-2 text-sm font-semibold text-indigo-700">
              Total projected monthly increase: {newHireForecast.projectedMonthlyIncreaseLabel}
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
