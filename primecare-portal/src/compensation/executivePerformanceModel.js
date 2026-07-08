/**
 * Phase 9.3 — Executive performance KPIs (compose intelligence; no duplicate math).
 */
import { sortRankingRows } from "./analytics/rankingMetrics.js";
import { formatInr, num, roundMoney, str } from "./analytics/analyticsFormatters.js";

/**
 * @param {{ intelligence?: object, model?: object }} input
 */
export function buildExecutivePerformanceModel(input = {}) {
  const intelligence = input.intelligence || {};
  const ratios = intelligence.ratios || {};
  const rows = intelligence.employeeRows || [];
  const rankings = intelligence.rankings || {};
  const territories = intelligence.territoryRows || [];

  const byPayroll = sortRankingRows(rows, "payrollCost", "desc");
  const byCollections = sortRankingRows(rows, "collections", "desc");
  const byCommission = sortRankingRows(rows, "commission", "desc");
  const byRevenue = sortRankingRows(rows, "revenue", "desc");
  const byEfficiency = sortRankingRows(rows, "collectionEfficiency", "desc");

  const topTerritory = [...territories].sort((a, b) => num(b.collections) - num(a.collections))[0];
  const lowestTerritory = [...territories].sort((a, b) => num(a.collections) - num(b.collections))[0];

  const commissionLiability = roundMoney(rows.reduce((sum, row) => sum + num(row.commission), 0));
  const avgCollection = rows.length
    ? roundMoney(rows.reduce((sum, row) => sum + num(row.collections), 0) / rows.length)
    : 0;
  const avgCommission = rows.length
    ? roundMoney(rows.reduce((sum, row) => sum + num(row.commission), 0) / rows.length)
    : 0;

  const admins = rows.filter((row) => str(row.employeeRole) === "admin");
  const agents = rows.filter((row) => str(row.employeeRole) === "agent");
  const topAdmin = sortRankingRows(admins.length ? admins : rows, "collections", "desc")[0];

  return {
    previewOnly: true,
    periodYm: ratios.periodYm || input.model?.reportingContext?.periodYm || "—",
    companyCollections: num(ratios.totalCollections),
    companyCollectionsLabel: ratios.totalCollectionsLabel || formatInr(ratios.totalCollections),
    companyPayroll: num(ratios.totalAgentPayroll),
    companyPayrollLabel: ratios.totalAgentPayrollLabel || formatInr(ratios.totalAgentPayroll),
    commissionLiability,
    commissionLiabilityLabel: formatInr(commissionLiability),
    collectionEfficiencyLabel: byEfficiency[0]?.collectionEfficiencyLabel || "—",
    revenuePerAgentLabel: ratios.revenuePerAgentLabel || "—",
    revenuePerLabLabel: formatInr(
      num(ratios.totalRevenue) / Math.max(1, input.model?.kpis?.activeLabs || rows.length)
    ),
    collectionsPerAgentLabel: ratios.collectionsPerAgentLabel || "—",
    averageCollection: avgCollection,
    averageCollectionLabel: formatInr(avgCollection),
    averageCommission: avgCommission,
    averageCommissionLabel: formatInr(avgCommission),
    highestEarner: byPayroll[0] || null,
    highestEarnerLabel: byPayroll[0]?.agentName || "—",
    highestTerritory: topTerritory?.territoryName || topTerritory?.territory || "—",
    lowestTerritory: lowestTerritory?.territoryName || lowestTerritory?.territory || "—",
    topAdmin: topAdmin || null,
    topAgent: byCollections[0] || rankings.topPerformers?.[0] || null,
    topLab: null,
    rankings: {
      topAgents: byCollections.slice(0, 8),
      bottomAgents: [...byCollections].reverse().slice(0, 8),
      topByRevenue: byRevenue.slice(0, 8),
      topByCommission: byCommission.slice(0, 8),
      topByPayroll: byPayroll.slice(0, 8),
      promotionCandidates: rows.filter((row) => row.promotionEligible).slice(0, 8),
    },
  };
}
