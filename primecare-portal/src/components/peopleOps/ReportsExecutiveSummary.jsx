import React, { useMemo } from "react";
import { AlertTriangle, MapPin, TrendingUp, User, Users, Wallet } from "lucide-react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";

/**
 * RC5 — Reports business summary first (compose existing read models only).
 */
export default function ReportsExecutiveSummary({ model, executivePerformance }) {
  const items = useMemo(() => {
    const perf = executivePerformance || {};
    const kpis = model?.kpis || {};
    const promotionPipeline = model?.charts?.promotionPipeline || model?.promotionPipelineRows || [];
    const promotionCount = promotionPipeline.filter((row) => row.eligible).length || promotionPipeline.length;

    return [
      {
        id: "best-agent",
        title: "Best Performing Agent",
        value: perf.topAgent?.agentName || perf.highestEarnerLabel || "None yet",
        subtitle: perf.topAgent?.collectionsLabel
          ? `Collections ${perf.topAgent.collectionsLabel}`
          : "By collections",
        icon: User,
      },
      {
        id: "needs-attention",
        title: "Needs Attention",
        value: perf.lowestTerritory || perf.lowestAgent?.agentName || "None flagged",
        subtitle: "Lowest territory / underperformer",
        icon: AlertTriangle,
      },
      {
        id: "top-territory",
        title: "Top Territory",
        value: perf.highestTerritory || "None yet",
        subtitle: "Highest collections",
        icon: MapPin,
      },
      {
        id: "lowest-territory",
        title: "Lowest Territory",
        value: perf.lowestTerritory || "None yet",
        subtitle: "Needs coaching or coverage",
        icon: MapPin,
      },
      {
        id: "highest-payroll",
        title: "Highest Payroll",
        value: formatPeopleOpsMetricValue(perf.companyPayrollLabel || kpis.currentPayrollLiabilityLabel, {
          emptyLabel: "No payroll preview yet",
        }),
        subtitle: "Company payroll liability",
        icon: Wallet,
      },
      {
        id: "highest-collections",
        title: "Highest Collections",
        value: formatPeopleOpsMetricValue(
          perf.topAgent?.collectionsLabel || perf.companyCollectionsLabel,
          { emptyLabel: "None yet" }
        ),
        subtitle: perf.topAgent?.agentName || "Company collections",
        icon: TrendingUp,
      },
      {
        id: "promotion",
        title: "Promotion Candidates",
        value: promotionCount ? String(promotionCount) : "None",
        subtitle: "Eligible for review",
        icon: Users,
      },
      {
        id: "commission",
        title: "Commission Payable",
        value: formatPeopleOpsMetricValue(perf.commissionLiabilityLabel || kpis.commissionPayableLabel, {
          emptyLabel: "Not configured",
        }),
        subtitle: `Avg ${perf.averageCommissionLabel || "—"}`,
        icon: Wallet,
      },
    ];
  }, [executivePerformance, model]);

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Business Summary</p>
      <KpiCardGrid columns={4} dense>
        {items.map((item) => (
          <KpiCard
            key={item.id}
            dense
            title={item.title}
            value={item.value}
            subtitle={item.subtitle}
            icon={item.icon}
          />
        ))}
      </KpiCardGrid>
    </div>
  );
}
