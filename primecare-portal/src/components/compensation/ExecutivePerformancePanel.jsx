import React from "react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { BarChart3 } from "lucide-react";

function RankTable({ title, rows = [], valueKey = "collectionsLabel" }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {rows.slice(0, 5).map((row, index) => (
          <div key={row.agentId || row.profileUserId || index} className="flex justify-between text-sm">
            <span>
              #{index + 1} {row.agentName || "—"}
            </span>
            <span className="tabular-nums font-medium">{row[valueKey] || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExecutivePerformancePanel({ performance }) {
  if (!performance) return null;

  return (
    <div className="space-y-4">
      <KpiCardGrid>
        <KpiCard title="Company Collections" value={performance.companyCollectionsLabel} icon={BarChart3} />
        <KpiCard title="Company Payroll" value={performance.companyPayrollLabel} icon={BarChart3} />
        <KpiCard title="Commission Liability" value={performance.commissionLiabilityLabel} icon={BarChart3} />
        <KpiCard title="Revenue / Agent" value={performance.revenuePerAgentLabel} icon={BarChart3} />
        <KpiCard title="Collections / Agent" value={performance.collectionsPerAgentLabel} icon={BarChart3} />
        <KpiCard title="Avg Collection" value={performance.averageCollectionLabel} icon={BarChart3} />
        <KpiCard title="Avg Commission" value={performance.averageCommissionLabel} icon={BarChart3} />
        <KpiCard title="Highest Earner" value={performance.highestEarnerLabel} icon={BarChart3} />
      </KpiCardGrid>
      <PeopleOpsSectionCard title="Executive Leaders" subtitle="Derived from compensation intelligence reads">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Top Agent</p>
            <p className="font-medium">{performance.topAgent?.agentName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Top Admin</p>
            <p className="font-medium">{performance.topAdmin?.agentName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Highest Territory</p>
            <p className="font-medium">{performance.highestTerritory || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Lowest Territory</p>
            <p className="font-medium">{performance.lowestTerritory || "—"}</p>
          </div>
        </div>
      </PeopleOpsSectionCard>
      {performance.rankings ? (
        <PeopleOpsSectionCard title="Executive Rankings" subtitle="Top and bottom performers — read-only intelligence compose">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <RankTable title="Top agents (collections)" rows={performance.rankings.topAgents} />
            <RankTable title="Bottom agents" rows={performance.rankings.bottomAgents} />
            <RankTable title="Revenue rankings" rows={performance.rankings.topByRevenue} valueKey="revenueLabel" />
            <RankTable title="Commission rankings" rows={performance.rankings.topByCommission} valueKey="commissionLabel" />
            <RankTable title="Payroll rankings" rows={performance.rankings.topByPayroll} valueKey="payrollCostLabel" />
            <RankTable title="Promotion candidates" rows={performance.rankings.promotionCandidates} valueKey="collectionsLabel" />
          </div>
        </PeopleOpsSectionCard>
      ) : null}
    </div>
  );
}
