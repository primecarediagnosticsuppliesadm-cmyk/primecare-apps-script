import React, { useMemo } from "react";
import { BarChart3, MapPin, TrendingUp, User, Wallet } from "lucide-react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";

/**
 * RC4 — Reports executive summary (compose existing read models only).
 */
export default function ReportsExecutiveSummary({ model, executivePerformance }) {
  const items = useMemo(() => {
    const perf = executivePerformance || {};
    const kpis = model?.kpis || {};
    return [
      {
        id: "revenue",
        title: "Revenue",
        value: formatPeopleOpsMetricValue(perf.revenuePerLabLabel, { emptyLabel: "Not available" }),
        subtitle: `Per agent ${perf.revenuePerAgentLabel || "—"}`,
        icon: TrendingUp,
      },
      {
        id: "collections",
        title: "Collections",
        value: formatPeopleOpsMetricValue(perf.companyCollectionsLabel, { emptyLabel: "Not available" }),
        subtitle: `Avg ${perf.averageCollectionLabel || "—"}`,
        icon: BarChart3,
      },
      {
        id: "payroll",
        title: "Payroll",
        value: formatPeopleOpsMetricValue(perf.companyPayrollLabel || kpis.currentPayrollLiabilityLabel, {
          emptyLabel: "No preview yet",
        }),
        subtitle: "Company payroll liability",
        icon: Wallet,
      },
      {
        id: "commission",
        title: "Commission",
        value: formatPeopleOpsMetricValue(perf.commissionLiabilityLabel || kpis.commissionPayableLabel, {
          emptyLabel: "Not configured",
        }),
        subtitle: `Avg ${perf.averageCommissionLabel || "—"}`,
        icon: Wallet,
      },
      {
        id: "top-agent",
        title: "Top Agent",
        value: perf.topAgent?.agentName || perf.highestEarnerLabel || "None",
        subtitle: perf.topAgent?.collectionsLabel ? `Collections ${perf.topAgent.collectionsLabel}` : "By collections",
        icon: User,
      },
      {
        id: "top-territory",
        title: "Top Territory",
        value: perf.highestTerritory || "None",
        subtitle: "Highest collections",
        icon: MapPin,
      },
      {
        id: "highest-collection",
        title: "Highest Collection",
        value: perf.topAgent?.collectionsLabel || formatPeopleOpsMetricValue(perf.companyCollectionsLabel, { emptyLabel: "None" }),
        subtitle: perf.topAgent?.agentName || "Top performer",
        icon: TrendingUp,
      },
      {
        id: "lowest-collection",
        title: "Lowest Collection",
        value: perf.lowestTerritory || "None",
        subtitle: "Territory baseline",
        icon: MapPin,
      },
    ];
  }, [executivePerformance, model]);

  return (
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
  );
}
