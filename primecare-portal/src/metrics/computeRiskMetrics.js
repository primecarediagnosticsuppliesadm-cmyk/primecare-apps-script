import { num } from "./primitives.js";
import { deriveCreditTierFromLabRecord } from "./creditTier.js";
import { computeReceivableMetrics } from "./computeReceivableMetrics.js";

/** Count HOLD / NEAR_LIMIT from v_labs_credit mapped rows (AdminDashboard merge fallback). */
export function countLabsCreditRiskFromCreditView(labs) {
  return (labs || []).filter((l) => {
    const s = String(l.creditStatus || "").trim().toUpperCase();
    return s === "HOLD" || s === "NEAR_LIMIT";
  }).length;
}

/** Top labs when Supabase executive rollups are unavailable (legacy v_labs_credit revenue sort). */
export function deriveTopLabsByRevenueFromLabsCreditFallback(labs) {
  return [...(labs || [])]
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5)
    .map((l) => ({
      labName: l.labName || l.labId || "Lab",
      revenue: Number(l.revenue || 0),
    }));
}

/** Labs portfolio summary from normalized lab rows (LabsPage KPI strip). */
export function summarizeLabsCreditPortfolio(normalizedLabs) {
  const rows = normalizedLabs || [];
  return {
    totalOutstanding: rows.reduce((sum, x) => sum + Number(x.outstandingAmount || 0), 0),
    totalRevenue: rows.reduce((sum, x) => sum + Number(x.revenue || 0), 0),
    labsWithOutstanding: rows.filter((x) => Number(x.outstandingAmount || 0) > 0).length,
    labsOnCreditHold: rows.filter((x) => x.creditStatus === "HOLD").length,
  };
}

/** Agent dashboard credit-risk bucket counts — same derivation as inline useMemo (assigned labs). */
export function summarizeAgentLabsCreditBuckets(assignedLabs) {
  const labs = assignedLabs || [];
  return {
    hold: labs.filter((lab) => deriveCreditTierFromLabRecord(lab) === "HOLD").length,
    nearLimit: labs.filter((lab) => deriveCreditTierFromLabRecord(lab) === "NEAR_LIMIT").length,
    ok: labs.filter((lab) => deriveCreditTierFromLabRecord(lab) === "OK").length,
    withOutstanding: labs.filter((lab) => num(lab.outstanding || lab.outstandingAmount) > 0).length,
  };
}

/**
 * Named bundle for dashboards / future reconciliation jobs — combines AR-derived and labs-credit-derived risk.
 */
export function computeRiskMetrics({ arRows, labsMappedForCreditView, assignedLabsForBuckets } = {}) {
  const ar = computeReceivableMetrics(arRows || []);
  const out = {
    arOutstanding: ar.outstandingReceivables,
    arLabsAtRiskCount: ar.labsAtCreditRisk,
  };
  if (labsMappedForCreditView) {
    out.labsMappedCreditRiskCount = countLabsCreditRiskFromCreditView(labsMappedForCreditView);
  }
  if (assignedLabsForBuckets) {
    out.assignedLabsCreditBuckets = summarizeAgentLabsCreditBuckets(assignedLabsForBuckets);
  }
  return out;
}
