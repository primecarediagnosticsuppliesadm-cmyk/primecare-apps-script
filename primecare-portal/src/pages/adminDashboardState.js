import {
  normalizeAdminDashboardPayload,
  normalizeAdminDashboardReadResult,
} from "@/api/primecareSupabaseApi.js";

export { normalizeAdminDashboardReadResult as normalizeAdminDashboardRead };

/**
 * @param {object|null|undefined} summary
 * @param {object|null|undefined} executive
 */
export function dashboardKpiValues(summary, executive) {
  return {
    outstandingReceivables: Number(executive?.outstandingReceivables ?? 0),
    recentVisits: Number(summary?.recentVisits ?? 0),
    inventorySkus: Number(summary?.stockStats?.totalSkus ?? 0),
    totalSoldValue: Number(summary?.totalSoldValue ?? 0),
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
 * Reject stale/empty hydration that would zero-out previously loaded KPIs.
 * @param {object|null|undefined} prevSummary
 * @param {object|null|undefined} prevExecutive
 * @param {{ summary: object, executive: object }} nextModel
 */
export function shouldRejectDashboardHydration(prevSummary, prevExecutive, nextModel) {
  if (!hasVisibleDashboardKpis(prevSummary, prevExecutive)) return false;
  return !hasVisibleDashboardKpis(nextModel.summary, nextModel.executive);
}

/**
 * @param {{ summary: object, executive: object, visits?: object, insights?: object }} model
 */
export function adminDashboardModelFromMerge(merged) {
  if (!merged?.summary || !merged?.executive) return null;
  return normalizeAdminDashboardPayload({
    executive: merged.executive,
    summary: merged.summary,
    visits: merged.visits,
    insights: merged.insights,
  });
}

/**
 * Apply normalized dashboard model to React state (never downgrade non-zero KPIs to zero).
 * @param {Object} params
 * @param {{ summary: object, executive: object, visits?: object, insights?: object }} params.model
 * @param {object|null|undefined} params.prevSummary
 * @param {object|null|undefined} params.prevExecutive
 * @param {function} params.setSummaryData
 * @param {function} params.setExecutiveData
 * @param {function} [params.setRecentVisitsData]
 * @param {function} [params.setInsightsData]
 */
export function applyAdminDashboardModel({
  model,
  prevSummary,
  prevExecutive,
  setSummaryData,
  setExecutiveData,
  setRecentVisitsData,
  setInsightsData,
}) {
  if (!model?.summary || !model?.executive) return false;

  if (shouldRejectDashboardHydration(prevSummary, prevExecutive, model)) {
    return false;
  }

  setSummaryData(model.summary);
  setExecutiveData(model.executive);
  if (model.visits != null && setRecentVisitsData) {
    setRecentVisitsData(model.visits);
  }
  if (model.insights != null && setInsightsData) {
    setInsightsData(model.insights);
  }
  return true;
}
