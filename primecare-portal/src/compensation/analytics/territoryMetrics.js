import { formatInr, num, ratioPct, roundMoney, roundPct, str } from "./analyticsFormatters.js";

export function buildTerritoryMetrics(employeeRows = []) {
  const territoryMap = new Map();

  for (const row of employeeRows || []) {
    const territories = str(row.territory).split(",").map((t) => t.trim()).filter(Boolean);
    const keys = territories.length ? territories : ["Unassigned"];

    for (const territory of keys) {
      const existing = territoryMap.get(territory) || {
        territory,
        agentCount: 0,
        collections: 0,
        revenue: 0,
        commission: 0,
        payrollCost: 0,
        efficiencyTotal: 0,
        efficiencyCount: 0,
      };
      existing.agentCount += 1;
      existing.collections = roundMoney(existing.collections + num(row.collections));
      existing.revenue = roundMoney(existing.revenue + num(row.revenue));
      existing.commission = roundMoney(existing.commission + num(row.commission));
      existing.payrollCost = roundMoney(existing.payrollCost + num(row.payrollCost));
      if (row.collectionEfficiency > 0) {
        existing.efficiencyTotal += row.collectionEfficiency;
        existing.efficiencyCount += 1;
      }
      territoryMap.set(territory, existing);
    }
  }

  return [...territoryMap.values()]
    .map((row) => {
      const efficiency =
        row.efficiencyCount > 0 ? roundPct(row.efficiencyTotal / row.efficiencyCount) : 0;
      return {
        ...row,
        collectionsLabel: formatInr(row.collections),
        revenueLabel: formatInr(row.revenue),
        commissionLabel: formatInr(row.commission),
        payrollCostLabel: formatInr(row.payrollCost),
        collectionEfficiency: efficiency,
        collectionEfficiencyLabel: `${efficiency}%`,
        payrollPctRevenue: ratioPct(row.payrollCost, row.revenue),
        payrollPctRevenueLabel: `${ratioPct(row.payrollCost, row.revenue)}%`,
        payrollPctCollections: ratioPct(row.payrollCost, row.collections),
        payrollPctCollectionsLabel: `${ratioPct(row.payrollCost, row.collections)}%`,
      };
    })
    .sort((a, b) => b.payrollCost - a.payrollCost);
}
