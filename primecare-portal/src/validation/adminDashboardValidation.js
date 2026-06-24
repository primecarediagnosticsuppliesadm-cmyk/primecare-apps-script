import { supabase } from "@/api/supabaseClient.js";
import { fetchAdminDashboardBoundedSourceRows } from "@/api/adminDashboardBoundedReads.js";
import { getAdminDashboardRead } from "@/api/primecareSupabaseApi.js";
import { computeRevenueMetrics } from "@/metrics/computeRevenueMetrics.js";
import { computeReceivableMetrics } from "@/metrics/computeReceivableMetrics.js";
import { rollupInventoryTableRows } from "@/metrics/computeInventoryMetrics.js";
import { normalizeLabIdKey } from "@/utils/labId.js";
import { QA_ADMIN_DASHBOARD_SEED } from "@/validation/qaSeedExpectations.js";
import {
  buildValidationReport,
  checkMutableMetricAcrossLayers,
  numOrNull,
  printQaValidationReport,
} from "@/validation/qaValidationCore.js";
import { resolveAdminDashboardUiSnapshot } from "@/predator/adminDashboardUiSnapshot.js";
import {
  hasAdminDashboardDomKpis,
  readAdminDashboardDomKpis,
} from "@/predator/adminDashboardDomKpis.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { ADMIN_DASHBOARD_MODULE } from "@/predator/adminDashboardUiSnapshot.js";

function apiOrdersRowCountFromTrace() {
  const traces = predatorStore.getApiExecutionsForModule(ADMIN_DASHBOARD_MODULE) || [];
  const hit = traces.find((t) => t.apiName === "getAdminDashboardRead");
  return numOrNull(hit?.detail?.orders);
}

function apiOrderIdsFromTrace() {
  const traces = predatorStore.getApiExecutionsForModule(ADMIN_DASHBOARD_MODULE) || [];
  const hit = traces.find((t) => t.apiName === "getAdminDashboardRead");
  const ids = hit?.detail?.orderIds;
  return Array.isArray(ids) ? ids : [];
}

function diffOrderIdSets(browserOrderIds = [], apiOrderIds = []) {
  const browserSet = new Set(browserOrderIds);
  const apiSet = new Set(apiOrderIds);
  return {
    browserOrderIds,
    apiOrderIds,
    missingFromApi: browserOrderIds.filter((id) => !apiSet.has(id)),
    extraInApi: apiOrderIds.filter((id) => !browserSet.has(id)),
  };
}

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function str(v) {
  return String(v ?? "").trim();
}

function mapOrderLineToItemShape(row) {
  return {
    order_id: row.order_id ?? row.orderId,
    total_price: row.net_line_total ?? row.netLineTotal ?? row.total_price,
    quantity: row.quantity,
    unit_price: row.unit_selling_price ?? row.unitSellingPrice ?? row.unit_price,
  };
}

/**
 * Browser-visible bounded Supabase rows + metric rollups (same scope as getAdminDashboardRead).
 */
async function fetchBrowserDashboardDbSnapshot() {
  const source = await fetchAdminDashboardBoundedSourceRows(supabase);
  const {
    errors,
    ordersRaw,
    orderIds,
    arRaw,
    visitsAllRaw,
    invRaw,
    labsRaw,
    orderLinesRaw,
    queryMeta,
    recentFrom,
  } = source;

  if (!supabase) {
    return {
      errors: { client: "Supabase client not configured" },
      ordersRowCount: null,
      orderIds: [],
      arOutstanding: null,
      visitsRowCount: null,
      inventorySkus: null,
      totalSoldValue: null,
    };
  }

  const orderItemsRaw = (orderLinesRaw || []).map(mapOrderLineToItemShape);
  const labNameById = new Map();
  for (const l of labsRaw) {
    const id = normalizeLabIdKey(l.lab_id ?? l.labId ?? l.id);
    const name = str(l.lab_name ?? l.labName ?? l.name);
    if (id && name) labNameById.set(id, name);
  }

  const { outstandingReceivables } = computeReceivableMetrics(arRaw);
  const stockStats = rollupInventoryTableRows(invRaw);
  const revenue = computeRevenueMetrics({
    ordersRaw,
    orderItemsRaw,
    todayYmd: localDateYmd(),
    labNameById,
  });

  return {
    errors,
    ordersRowCount: ordersRaw.length,
    orderIds,
    arOutstanding: outstandingReceivables,
    visitsRowCount: visitsAllRaw.length,
    inventorySkus: stockStats.totalSkus,
    totalSoldValue: revenue.totalSoldValue,
    queryChains: queryMeta,
    postgrestFilters: `orders order_date >= ${recentFrom}; visits/orders bounded per hqReadBounds`,
  };
}

/**
 * @param {Object} [options]
 * @param {{ executive?: object, summary?: object }|null} [options.rendered]
 * @param {boolean} [options.printReport]
 * @param {boolean} [options.forceApi] — bypass dashboard read cache/in-flight (default true)
 */
export async function runAdminDashboardValidation(options = {}) {
  const { rendered = null, printReport = true } = options;
  const forceApi = options.forceApi !== false;
  const expected = QA_ADMIN_DASHBOARD_SEED;

  const browser = await fetchBrowserDashboardDbSnapshot();
  const apiResult = await getAdminDashboardRead({ force: forceApi });
  const apiValidatedAt = Date.now();
  const api = apiResult?.success ? apiResult.data : null;

  const uiSnapshot = resolveAdminDashboardUiSnapshot({
    explicitRendered: rendered,
    apiValidatedAt,
  });

  const apiExecutive = api?.executive || {};
  const apiSummary = api?.summary || {};
  const apiStock = apiSummary.stockStats || {};

  const uiRendered = uiSnapshot.fresh ? uiSnapshot.rendered : null;
  const uiExecutive = uiRendered?.executive || {};
  const uiSummary = uiRendered?.summary || {};
  const uiStock = uiSummary.stockStats || {};
  const domKpis = readAdminDashboardDomKpis();
  const domKpisVisible = hasAdminDashboardDomKpis();

  const uiOutstanding =
    domKpis.outstanding_receivables ??
    (uiSnapshot.fresh ? numOrNull(uiExecutive.outstandingReceivables) : null);
  const uiRecentVisits = uiSnapshot.fresh ? numOrNull(uiSummary.recentVisits) : null;
  const uiInventorySkus =
    domKpis.inventory_skus ??
    (uiSnapshot.fresh
      ? numOrNull(uiSummary.inventorySkus ?? uiStock.totalSkus)
      : null);
  const uiTotalSold =
    domKpis.total_sold_value ??
    (uiSnapshot.fresh ? numOrNull(uiSummary.totalSoldValue) : null);

  const apiOrdersRowCount =
    numOrNull(apiSummary.ordersRowCount) ?? apiOrdersRowCountFromTrace();
  const apiOrderIds = apiOrderIdsFromTrace();
  const ordersIdDiff = diffOrderIdSets(browser.orderIds || [], apiOrderIds);
  if (
    browser.ordersRowCount != null &&
    apiOrdersRowCount != null &&
    browser.ordersRowCount !== apiOrdersRowCount
  ) {
    console.warn("[AdminDashboard validation] orders count drift", {
      browserRls: browser.ordersRowCount,
      apiPayload: apiOrdersRowCount,
      ...ordersIdDiff,
      forceApi,
    });
  }
  const uiOrdersHasExplicitValue =
    domKpis.orders_count != null ||
    (uiSnapshot.fresh &&
      (uiRendered?.summary?.ordersCount != null || uiSummary.ordersCount != null));
  const uiOrdersRowCount = uiOrdersHasExplicitValue
    ? numOrNull(
        domKpis.orders_count ??
          uiRendered?.summary?.ordersCount ??
          uiSummary.ordersCount
      )
    : null;

  const checks = [
    checkMutableMetricAcrossLayers({
      id: "orders_count",
      label: "Orders row count (mutable, RLS/API)",
      seedBaseline: expected.ordersCount,
      omitUiUnlessPresent: true,
      boundedApiMax: 2000,
      layers: {
        browserRls: browser.ordersRowCount,
        dbComputed: browser.ordersRowCount,
        apiPayload: apiOrdersRowCount,
        uiRendered: uiOrdersRowCount,
      },
    }),
    checkMutableMetricAcrossLayers({
      id: "outstanding_receivables",
      label: "Outstanding receivables (₹, mutable)",
      seedBaseline: expected.outstandingReceivables,
      layers: {
        browserRls: browser.arOutstanding,
        dbComputed: browser.arOutstanding,
        apiPayload: numOrNull(apiExecutive.outstandingReceivables),
        uiRendered: uiOutstanding,
      },
    }),
    checkMutableMetricAcrossLayers({
      id: "recent_visits",
      label: "Recent visits count (mutable)",
      seedBaseline: expected.recentVisits,
      layers: {
        browserRls: browser.visitsRowCount,
        dbComputed: browser.visitsRowCount,
        apiPayload: numOrNull(apiSummary.recentVisits),
        uiRendered: uiRecentVisits,
      },
    }),
    checkMutableMetricAcrossLayers({
      id: "inventory_skus",
      label: "Inventory SKU count (mutable, executive portfolio)",
      seedBaseline: expected.inventorySkus,
      omitUiUnlessPresent: true,
      layers: {
        browserRls: browser.inventorySkus,
        dbComputed: browser.inventorySkus,
        apiPayload: numOrNull(apiStock.totalSkus),
        uiRendered: uiInventorySkus,
      },
    }),
    checkMutableMetricAcrossLayers({
      id: "total_sold_value",
      label: "Total sold value (₹, mutable)",
      seedBaseline: expected.totalSoldValue,
      boundedApiMax: 2000,
      layers: {
        browserRls: browser.totalSoldValue,
        dbComputed: browser.totalSoldValue,
        apiPayload: numOrNull(apiSummary.totalSoldValue),
        uiRendered: uiTotalSold,
      },
    }),
  ];

  if (uiSnapshot.fresh && !uiOrdersHasExplicitValue) {
    checks.push({
      id: "ui_snapshot_metric_missing.orders_count",
      label: "Orders count UI KPI",
      status: "warn",
      expected: "ordersCount only when Admin Dashboard renders that KPI",
      actual: {
        uiRendered: null,
        browserRls: browser.ordersRowCount,
        apiPayload: apiOrdersRowCount,
      },
      message:
        "Orders count is backend/API validated; UI layer not rendered on Admin Dashboard",
    });
  }

  if (!uiSnapshot.fresh && !domKpisVisible) {
    checks.push({
      id: "ui_snapshot_freshness",
      label: "Admin Dashboard rendered KPI snapshot",
      status: "warn",
      expected: "fresh rendered snapshot from Admin Dashboard page",
      actual: {
        reason: uiSnapshot.reason,
        source: uiSnapshot.source,
        ageMs: uiSnapshot.ageMs,
        capturedAt: uiSnapshot.capturedAt,
        apiValidatedAt: uiSnapshot.apiValidatedAt,
        domKpisVisible,
      },
      message:
        uiSnapshot.message || "Open Admin Dashboard to validate UI render sync",
    });
  }

  if (Object.keys(browser.errors || {}).length > 0) {
    checks.push({
      id: "browser_query_errors",
      label: "Browser Supabase query errors",
      status: "fail",
      expected: "no errors",
      actual: browser.errors,
      message: Object.entries(browser.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; "),
    });
  }

  if (!apiResult?.success || !api) {
    checks.push({
      id: "api_payload",
      label: "getAdminDashboardRead payload",
      status: "fail",
      expected: "success + data",
      actual: { success: apiResult?.success ?? false },
      message: "API read did not return success payload",
    });
  }

  const report = buildValidationReport("Admin Dashboard", checks);
  report.meta = {
    browserQuery: browser.queryChains,
    browserFilters: browser.postgrestFilters,
    apiSuccess: Boolean(apiResult?.success),
    uiSnapshot,
    domKpis,
    domKpisVisible,
    ordersIdDiff,
    forceApi,
  };

  if (printReport) {
    printQaValidationReport(report);
  }

  report.layerSnapshot = {
    ordersRowCount: browser.ordersRowCount,
    apiOrdersRowCount,
    uiOrdersRowCount,
    arOutstanding: browser.arOutstanding,
    visitsRowCount: browser.visitsRowCount,
    inventorySkus: browser.inventorySkus,
    totalSoldValue: browser.totalSoldValue,
    apiOutstanding: numOrNull(apiExecutive.outstandingReceivables),
    apiRecentVisits: numOrNull(apiSummary.recentVisits),
    apiInventorySkus: numOrNull(apiStock.totalSkus),
    apiTotalSold: numOrNull(apiSummary.totalSoldValue),
    uiOutstanding,
    uiRecentVisits,
    uiInventorySkus,
    uiTotalSold,
  };

  return report;
}

export { printQaValidationReport, QA_ADMIN_DASHBOARD_SEED };
