import { num, str } from "./primitives.js";

export function isArCreditRiskRow(arRow) {
  const hold = str(arRow.credit_hold ?? arRow.creditHold).toUpperCase();
  const cs = str(arRow.credit_status ?? arRow.creditStatus).toUpperCase();
  const risk = str(arRow.risk_status ?? arRow.credit_risk ?? arRow.creditRisk).toLowerCase();
  if (hold === "HOLD" || hold === "YES") return true;
  if (cs === "HOLD" || cs === "NEAR_LIMIT") return true;
  if (risk.includes("high") || risk.includes("hold") || risk.includes("risk")) return true;
  return false;
}

/**
 * Raw AR table rollups (matches Admin dashboard / unfiltered Σ outstanding).
 */
export function computeReceivableMetrics(arRaw) {
  let outstandingReceivables = 0;
  let labsAtCreditRisk = 0;
  for (const ar of arRaw || []) {
    const outstanding = num(
      ar.outstanding ?? ar.outstanding_amount ?? ar.outstandingAmount ?? ar.balance ?? 0
    );
    outstandingReceivables += outstanding;
    if (isArCreditRiskRow(ar)) labsAtCreditRisk += 1;
  }
  return { outstandingReceivables, labsAtCreditRisk };
}

/**
 * Collections list summary (filtered rows only — matches getCollectionsRead summary).
 */
export function summarizeCollectionsList(collections, todayCollections = 0) {
  const totalOutstanding = (collections || []).reduce((s, c) => s + num(c.outstandingAmount), 0);
  const overdueCount = (collections || []).filter((c) => num(c.overdueDays) > 0).length;
  const highRiskCount = (collections || []).filter(
    (c) => String(c.riskStatus || "").toLowerCase() === "high"
  ).length;
  return {
    totalOutstanding,
    overdueCount,
    highRiskCount,
    todayCollections: num(todayCollections),
  };
}
