import {
  normalizeAdminDashboardPayload,
  normalizeAdminDashboardReadResult,
} from "@/api/primecareSupabaseApi.js";

export { normalizeAdminDashboardReadResult as normalizeAdminDashboardRead };

/** @type {import('@/pages/adminDashboardState.js').AdminDashboardKpiModel} */
export const EMPTY_DASHBOARD_KPIS = {
  outstandingReceivables: 0,
  recentVisits: 0,
  inventorySkus: 0,
  totalSoldValue: 0,
  todaysRevenue: 0,
  labsAtCreditRisk: 0,
  productsNearStockout: 0,
};

/**
 * @typedef {Object} AdminDashboardKpiModel
 * @property {number} outstandingReceivables
 * @property {number} recentVisits
 * @property {number} inventorySkus
 * @property {number} totalSoldValue
 * @property {number} todaysRevenue
 * @property {number} labsAtCreditRisk
 * @property {number} productsNearStockout
 */

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
 * @returns {AdminDashboardKpiModel}
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
 * @param {AdminDashboardKpiModel|null|undefined} kpis
 */
export function hasVisibleKpiModel(kpis) {
  if (!kpis) return false;
  return (
    kpis.outstandingReceivables > 0 ||
    kpis.recentVisits > 0 ||
    kpis.inventorySkus > 0 ||
    kpis.totalSoldValue > 0
  );
}

/**
 * @param {object|null|undefined} summary
 * @param {object|null|undefined} executive
 */
export function hasVisibleDashboardKpis(summary, executive) {
  return hasVisibleKpiModel(selectAdminDashboardKpis(summary, executive));
}

/**
 * @param {AdminDashboardKpiModel|null|undefined} prev
 * @param {AdminDashboardKpiModel} next
 */
export function mergeKpiModel(prev, next) {
  return {
    outstandingReceivables: pickPreservedKpi(
      next.outstandingReceivables,
      prev?.outstandingReceivables
    ),
    recentVisits: pickPreservedKpi(next.recentVisits, prev?.recentVisits),
    inventorySkus: pickPreservedKpi(next.inventorySkus, prev?.inventorySkus),
    totalSoldValue: pickPreservedKpi(next.totalSoldValue, prev?.totalSoldValue),
    todaysRevenue: pickPreservedKpi(next.todaysRevenue, prev?.todaysRevenue),
    labsAtCreditRisk: pickPreservedKpi(next.labsAtCreditRisk, prev?.labsAtCreditRisk),
    productsNearStockout: pickPreservedKpi(
      next.productsNearStockout,
      prev?.productsNearStockout
    ),
  };
}

/**
 * @param {object|null|undefined} prev
 * @param {object|null|undefined} next
 */
function mergeSummaryModel(prev, next) {
  const prevStock = prev?.stockStats || {};
  const nextStock = next?.stockStats || {};
  const mergedSkus = pickPreservedKpi(
    next?.inventorySkus ?? nextStock.totalSkus,
    prev?.inventorySkus ?? prevStock.totalSkus
  );

  return {
    ...(prev || {}),
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
 * Sync normalized KPI fields back onto summary/executive objects.
 * @param {object} summary
 * @param {object} executive
 * @param {AdminDashboardKpiModel} kpis
 */
export function applyKpiModelToDashboardObjects(summary, executive, kpis) {
  return {
    summary: {
      ...summary,
      recentVisits: kpis.recentVisits,
      totalSoldValue: kpis.totalSoldValue,
      inventorySkus: kpis.inventorySkus,
      stockStats: {
        ...(summary.stockStats || {}),
        totalSkus: kpis.inventorySkus,
      },
    },
    executive: {
      ...executive,
      outstandingReceivables: kpis.outstandingReceivables,
      todaysRevenue: kpis.todaysRevenue,
      labsAtCreditRisk: kpis.labsAtCreditRisk,
      productsNearStockout: kpis.productsNearStockout,
    },
  };
}

/**
 * @param {{ summary: object, executive: object, visits?: object, insights?: object }} merged
 */
export function adminDashboardModelFromMerge(merged) {
  if (!merged?.summary || !merged?.executive) return null;

  const normalized = normalizeAdminDashboardPayload({
    executive: merged.executive,
    summary: merged.summary,
    visits: merged.visits,
    insights: merged.insights,
  });

  const summary = mergeSummaryModel(null, normalized.summary);
  const executive = mergeExecutiveModel(null, normalized.executive);
  const kpis = selectAdminDashboardKpis(summary, executive);
  const synced = applyKpiModelToDashboardObjects(summary, executive, kpis);

  return {
    summary: synced.summary,
    executive: synced.executive,
    kpis,
    visits: normalized.visits,
    insights: normalized.insights,
  };
}

/**
 * Apply normalized dashboard model atomically (bundle + KPI model).
 * @param {Object} params
 * @param {{ summary: object, executive: object, visits?: object, insights?: object }} params.model
 * @param {function} params.setDashboardBundle
 * @param {function} params.setKpiModel
 * @param {function} [params.setRecentVisitsData]
 * @param {function} [params.setInsightsData]
 * @param {import('react').MutableRefObject<object|null|undefined>} [params.summaryRef]
 * @param {import('react').MutableRefObject<object|null|undefined>} [params.executiveRef]
 * @param {import('react').MutableRefObject<AdminDashboardKpiModel|null|undefined>} [params.kpiModelRef]
 */
export function buildHydratedDashboardState(prevBundle, prevKpis, model) {
  const mergedSummary = mergeSummaryModel(prevBundle?.summary, model.summary);
  const mergedExecutive = mergeExecutiveModel(prevBundle?.executive, model.executive);
  const nextKpis = selectAdminDashboardKpis(mergedSummary, mergedExecutive);
  const mergedKpis = mergeKpiModel(prevKpis, nextKpis);
  const synced = applyKpiModelToDashboardObjects(
    mergedSummary,
    mergedExecutive,
    mergedKpis
  );

  return {
    bundle: {
      summary: synced.summary,
      executive: synced.executive,
    },
    kpis: mergedKpis,
    hasVisibleKpis: hasVisibleKpiModel(mergedKpis),
  };
}

/**
 * Apply normalized dashboard model atomically (bundle + KPI model).
 */
export function applyAdminDashboardModel({
  model,
  setDashboardBundle,
  setKpiModel,
  setRecentVisitsData,
  setInsightsData,
  summaryRef,
  executiveRef,
  kpiModelRef,
  prevBundle,
  prevKpis,
}) {
  if (!model?.summary || !model?.executive) return false;

  const hydrated = buildHydratedDashboardState(prevBundle, prevKpis, model);

  setDashboardBundle(hydrated.bundle);
  setKpiModel(hydrated.kpis);

  if (summaryRef) summaryRef.current = hydrated.bundle.summary;
  if (executiveRef) executiveRef.current = hydrated.bundle.executive;
  if (kpiModelRef) kpiModelRef.current = hydrated.kpis;

  if (model.visits != null && setRecentVisitsData) {
    setRecentVisitsData(model.visits);
  }
  if (model.insights != null && setInsightsData) {
    setInsightsData(model.insights);
  }

  return hydrated.hasVisibleKpis;
}
