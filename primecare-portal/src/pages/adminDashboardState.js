import {
  normalizeAdminDashboardPayload,
  normalizeAdminDashboardReadResult,
} from "@/api/primecareSupabaseApi.js";

export { normalizeAdminDashboardReadResult as normalizeAdminDashboardRead };

/**
 * Prefer a positive KPI; never replace a loaded non-zero with zero.
 * @param {number} nextVal
 * @param {number} prevVal
 */
export function pickPreservedKpi(nextVal, prevVal) {
  const next = Number(nextVal);
  const prev = Number(prevVal);
  if (Number.isFinite(next) && next > 0) return next;
  if (Number.isFinite(prev) && prev > 0) return prev;
  if (Number.isFinite(next)) return next;
  if (Number.isFinite(prev)) return prev;
  return 0;
}

/**
 * @param {object|null|undefined} summary
 * @param {object|null|undefined} executive
 */
export function dashboardKpiValues(summary, executive) {
  return {
    outstandingReceivables: Number(executive?.outstandingReceivables ?? 0),
    recentVisits: Number(summary?.recentVisits ?? 0),
    inventorySkus: Number(summary?.inventorySkus ?? summary?.stockStats?.totalSkus ?? 0),
    totalSoldValue: Number(summary?.totalSoldValue ?? 0),
  };
}

/**
 * Stable KPI view for cards + Predator (camelCase only).
 * @param {object|null|undefined} summary
 * @param {object|null|undefined} executive
 */
export function selectAdminDashboardKpis(summary, executive) {
  const k = dashboardKpiValues(summary, executive);
  return {
    outstandingReceivables: k.outstandingReceivables,
    recentVisits: k.recentVisits,
    inventorySkus: k.inventorySkus,
    totalSoldValue: k.totalSoldValue,
    todaysRevenue: Number(executive?.todaysRevenue ?? 0),
    labsAtCreditRisk: Number(executive?.labsAtCreditRisk ?? 0),
    productsNearStockout: Number(executive?.productsNearStockout ?? 0),
  };
}

/**
 * @param {object|null|undefined} summary
 * @param {object|null|undefined} executive
 */
export function hasVisibleDashboardKpis(summary, executive) {
  const k = dashboardKpiValues(summary, executive);
  return (
    k.outstandingReceivables > 0 ||
    k.recentVisits > 0 ||
    k.inventorySkus > 0 ||
    k.totalSoldValue > 0
  );
}

/**
 * @param {object|null|undefined} prev
 * @param {object|null|undefined} next
 */
function mergeSummaryModel(prev, next) {
  const prevStock = prev?.stockStats || {};
  const nextStock = next?.stockStats || {};
  const mergedSkus = pickPreservedKpi(nextStock.totalSkus, prevStock.totalSkus);

  return {
    ...(prev || {}),
    ...(next || {}),
    recentVisits: pickPreservedKpi(next?.recentVisits, prev?.recentVisits),
    totalSoldValue: pickPreservedKpi(next?.totalSoldValue, prev?.totalSoldValue),
    todayCollections: pickPreservedKpi(next?.todayCollections, prev?.todayCollections),
    inventorySkus: mergedSkus,
    stockStats: {
      ...prevStock,
      ...nextStock,
      totalSkus: mergedSkus,
      criticalItems: pickPreservedKpi(nextStock.criticalItems, prevStock.criticalItems),
      reorderItems: pickPreservedKpi(nextStock.reorderItems, prevStock.reorderItems),
      healthyItems: pickPreservedKpi(nextStock.healthyItems, prevStock.healthyItems),
    },
  };
}

/**
 * @param {object|null|undefined} prev
 * @param {object|null|undefined} next
 */
function mergeExecutiveModel(prev, next) {
  return {
    ...(prev || {}),
    ...(next || {}),
    todaysRevenue: pickPreservedKpi(next?.todaysRevenue, prev?.todaysRevenue),
    outstandingReceivables: pickPreservedKpi(
      next?.outstandingReceivables,
      prev?.outstandingReceivables
    ),
    labsAtCreditRisk: pickPreservedKpi(next?.labsAtCreditRisk, prev?.labsAtCreditRisk),
    productsNearStockout: pickPreservedKpi(
      next?.productsNearStockout,
      prev?.productsNearStockout
    ),
    topLabsByRevenue:
      Array.isArray(next?.topLabsByRevenue) && next.topLabsByRevenue.length > 0
        ? next.topLabsByRevenue
        : Array.isArray(prev?.topLabsByRevenue)
          ? prev.topLabsByRevenue
          : [],
  };
}

/**
 * @param {{ summary: object, executive: object, visits?: object, insights?: object }} model
 */
export function adminDashboardModelFromMerge(merged) {
  if (!merged?.summary || !merged?.executive) return null;
  const normalized = normalizeAdminDashboardPayload({
    executive: merged.executive,
    summary: merged.summary,
    visits: merged.visits,
    insights: merged.insights,
  });
  return {
    ...normalized,
    summary: mergeSummaryModel(null, normalized.summary),
    executive: mergeExecutiveModel(null, normalized.executive),
  };
}

/**
 * Apply normalized dashboard model to React state (KPI-preserving merge).
 * @param {Object} params
 * @param {{ summary: object, executive: object, visits?: object, insights?: object }} params.model
 * @param {function} params.setSummaryData
 * @param {function} params.setExecutiveData
 * @param {function} [params.setRecentVisitsData]
 * @param {function} [params.setInsightsData]
 * @param {import('react').MutableRefObject<object|null|undefined>} [params.summaryRef]
 * @param {import('react').MutableRefObject<object|null|undefined>} [params.executiveRef]
 */
export function applyAdminDashboardModel({
  model,
  setSummaryData,
  setExecutiveData,
  setRecentVisitsData,
  setInsightsData,
  summaryRef,
  executiveRef,
}) {
  if (!model?.summary || !model?.executive) return false;

  let mergedSummary = null;
  let mergedExecutive = null;

  setSummaryData((prev) => {
    mergedSummary = mergeSummaryModel(prev, model.summary);
    if (summaryRef) summaryRef.current = mergedSummary;
    return mergedSummary;
  });

  setExecutiveData((prev) => {
    mergedExecutive = mergeExecutiveModel(prev, model.executive);
    if (executiveRef) executiveRef.current = mergedExecutive;
    return mergedExecutive;
  });

  if (model.visits != null && setRecentVisitsData) {
    setRecentVisitsData(model.visits);
  }
  if (model.insights != null && setInsightsData) {
    setInsightsData(model.insights);
  }

  return Boolean(mergedSummary && mergedExecutive);
}
