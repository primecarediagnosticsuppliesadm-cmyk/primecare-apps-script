import { RANKING_SORT_KEYS } from "../compensationIntelligenceEngine.js";
import { num, str } from "./analyticsFormatters.js";

export { RANKING_SORT_KEYS };

export function sortRankingRows(rows = [], sortKey = "collections", direction = "desc") {
  const key = RANKING_SORT_KEYS.includes(sortKey) ? sortKey : "collections";
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = num(a[key]);
    const bv = num(b[key]);
    if (av === bv) return str(a.agentName).localeCompare(str(b.agentName)) * factor;
    return (av - bv) * factor;
  });
}

export function buildRankingMetrics(employeeRows = []) {
  const agentRows = employeeRows || [];
  return {
    sortKeys: RANKING_SORT_KEYS,
    agentRows,
    topPerformers: sortRankingRows(agentRows, "payrollCost", "desc").slice(0, 8),
    bottomPerformers: sortRankingRows(agentRows, "payrollCost", "asc").slice(0, 8),
  };
}
