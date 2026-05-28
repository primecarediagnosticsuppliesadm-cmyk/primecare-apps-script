import { predatorStore } from "@/predator/predatorStore.js";

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read a layer value from QA validation check actual payload.
 * @param {Object[]} checks
 * @param {string} checkId
 * @param {string} layerKey
 */
function layerFromCheck(checks, checkId, layerKey) {
  const check = (checks || []).find((c) => c.id === checkId);
  const raw = check?.actual?.[layerKey];
  return numOrNull(raw);
}

/**
 * Latest getAdminDashboardRead execution trace (row counts per table, not aggregate rowsReturned).
 */
function latestAdminDashboardApiTrace() {
  const traces = predatorStore.getApiExecutionsForModule("Admin Dashboard");
  return traces.find((t) => t.apiName === "getAdminDashboardRead") || traces[0] || null;
}

/**
 * Map API/UI computed KPI paths from rendered dashboard state.
 * @param {{ executive?: object, summary?: object }|null} rendered
 */
function uiMetricsFromRendered(rendered) {
  const executive = rendered?.executive || {};
  const summary = rendered?.summary || {};
  const stock = summary.stockStats || {};
  return {
    uiOutstanding: numOrNull(executive.outstandingReceivables),
    uiRecentVisits: numOrNull(summary.recentVisits),
    uiInventorySkus: numOrNull(stock.totalSkus),
    uiTotalSold: numOrNull(summary.totalSoldValue),
    uiTopLabsCount: Array.isArray(executive.topLabsByRevenue)
      ? executive.topLabsByRevenue.length
      : null,
  };
}

/**
 * Predator-only layer snapshot for Admin Dashboard diagnosis.
 * Uses QA validation report + API trace + rendered React state (no dashboard logic changes).
 *
 * @param {Object} params
 * @param {Object} [params.legacyReport] — output of runAdminDashboardValidation
 * @param {{ executive?: object, summary?: object }|null} [params.rendered]
 */
export function buildAdminDashboardPredatorSnapshot({ legacyReport, rendered = null }) {
  const base = legacyReport?.layerSnapshot || {};
  const checks = legacyReport?.checks || [];
  const apiTrace = latestAdminDashboardApiTrace();
  const ui = uiMetricsFromRendered(rendered);

  const apiOutstanding =
    layerFromCheck(checks, "outstanding_receivables", "apiPayload") ?? base.apiOutstanding;
  const apiRecentVisits =
    layerFromCheck(checks, "recent_visits", "apiPayload") ?? base.apiRecentVisits;
  const apiInventorySkus =
    layerFromCheck(checks, "inventory_skus", "apiPayload") ?? base.apiInventorySkus;
  const apiTotalSold =
    layerFromCheck(checks, "total_sold_value", "apiPayload") ?? base.apiTotalSold;

  const apiOrdersRowCount =
    layerFromCheck(checks, "orders_count", "apiPayload") ??
    base.apiOrdersRowCount ??
    numOrNull(apiTrace?.detail?.orders);

  return {
    ordersRowCount: base.ordersRowCount ?? layerFromCheck(checks, "orders_count", "browserRls"),
    apiOrdersRowCount,
    uiOrdersRowCount:
      layerFromCheck(checks, "orders_count", "uiRendered") ?? base.uiOrdersRowCount ?? null,
    arOutstanding: base.arOutstanding,
    visitsRowCount: base.visitsRowCount,
    inventorySkus: base.inventorySkus,
    totalSoldValue: base.totalSoldValue,
    apiOutstanding,
    apiRecentVisits,
    apiInventorySkus,
    apiTotalSold,
    /** Orders table rows from API trace detail — not rowsReturned (aggregate). */
    apiTraceOrders: apiOrdersRowCount ?? numOrNull(apiTrace?.detail?.orders),
    apiTracePayloadBytes: apiTrace?.payloadBytes ?? null,
    uiOutstanding: layerFromCheck(checks, "outstanding_receivables", "uiRendered") ?? ui.uiOutstanding,
    uiRecentVisits: layerFromCheck(checks, "recent_visits", "uiRendered") ?? ui.uiRecentVisits,
    uiInventorySkus: layerFromCheck(checks, "inventory_skus", "uiRendered") ?? ui.uiInventorySkus,
    uiTotalSold: layerFromCheck(checks, "total_sold_value", "uiRendered") ?? ui.uiTotalSold,
    uiTopLabsCount: ui.uiTopLabsCount,
  };
}
