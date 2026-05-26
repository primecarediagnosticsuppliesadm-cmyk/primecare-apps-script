import { supabase } from "@/api/supabaseClient.js";
import { getAdminDashboardRead } from "@/api/primecareSupabaseApi.js";
import { computeRevenueMetrics } from "@/metrics/computeRevenueMetrics.js";
import { computeReceivableMetrics } from "@/metrics/computeReceivableMetrics.js";
import { rollupInventoryTableRows } from "@/metrics/computeInventoryMetrics.js";
import { normalizeLabIdKey } from "@/utils/labId.js";
import { QA_ADMIN_DASHBOARD_SEED } from "@/validation/qaSeedExpectations.js";
import {
  buildValidationReport,
  checkMetricAcrossLayers,
  numOrNull,
  printQaValidationReport,
} from "@/validation/qaValidationCore.js";

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
 * Browser-visible Supabase rows + metric rollups (RLS applies; same queries as dashboard).
 */
async function fetchBrowserDashboardDbSnapshot() {
  if (!supabase) {
    return {
      errors: { client: "Supabase client not configured" },
      ordersRowCount: null,
      arOutstanding: null,
      visitsRowCount: null,
      inventorySkus: null,
      totalSoldValue: null,
    };
  }

  const errors = {};
  const [ordersRes, arRes, visitsRes, invRes, orderLinesRes, labsRes] = await Promise.all([
    supabase.from("orders").select("*"),
    supabase.from("ar_credit_control").select("*"),
    supabase.from("agent_visits").select("*"),
    supabase.from("inventory").select("*"),
    supabase.from("order_lines").select("*"),
    supabase.from("labs").select("*"),
  ]);

  if (ordersRes.error) errors.orders = ordersRes.error.message;
  if (arRes.error) errors.ar_credit_control = arRes.error.message;
  if (visitsRes.error) errors.agent_visits = visitsRes.error.message;
  if (invRes.error) errors.inventory = invRes.error.message;
  if (orderLinesRes.error) errors.order_lines = orderLinesRes.error.message;
  if (labsRes.error) errors.labs = labsRes.error.message;

  const ordersRaw = ordersRes.error ? [] : ordersRes.data || [];
  const arRaw = arRes.error ? [] : arRes.data || [];
  const visitsRaw = visitsRes.error ? [] : visitsRes.data || [];
  const invRaw = invRes.error ? [] : invRes.data || [];
  const orderLinesRaw = orderLinesRes.error ? [] : orderLinesRes.data || [];
  const labsRaw = labsRes.error ? [] : labsRes.data || [];

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
    arOutstanding: outstandingReceivables,
    visitsRowCount: visitsRaw.length,
    inventorySkus: stockStats.totalSkus,
    totalSoldValue: revenue.totalSoldValue,
    queryChains: {
      orders: 'from("orders").select("*")',
      ar_credit_control: 'from("ar_credit_control").select("*")',
      agent_visits: 'from("agent_visits").select("*")',
      inventory: 'from("inventory").select("*")',
      order_lines: 'from("order_lines").select("*")',
    },
    postgrestFilters: "none (no eq/match/in/filter on dashboard reads)",
  };
}

/**
 * @param {Object} [options]
 * @param {{ executive?: object, summary?: object }|null} [options.rendered]
 * @param {boolean} [options.printReport]
 */
export async function runAdminDashboardValidation(options = {}) {
  const { rendered = null, printReport = true } = options;
  const expected = QA_ADMIN_DASHBOARD_SEED;

  const browser = await fetchBrowserDashboardDbSnapshot();
  const apiResult = await getAdminDashboardRead({ force: true });
  const api = apiResult?.success ? apiResult.data : null;

  const apiExecutive = api?.executive || {};
  const apiSummary = api?.summary || {};
  const apiStock = apiSummary.stockStats || {};

  const uiExecutive = rendered?.executive || {};
  const uiSummary = rendered?.summary || {};
  const uiStock = uiSummary.stockStats || {};

  // Receivables is mutable in QA (payments/notes change over time).
  // Validate cross-layer agreement rather than a fixed seed number.
  const expectedOutstandingReceivables =
    typeof browser.arOutstanding === "number"
      ? browser.arOutstanding
      : expected.outstandingReceivables;

  const checks = [
    checkMetricAcrossLayers({
      id: "orders_count",
      label: "Orders row count",
      expected: expected.ordersCount,
      layers: {
        browserRls: browser.ordersRowCount,
        dbComputed: browser.ordersRowCount,
        apiPayload: null,
        uiRendered: null,
      },
    }),
    checkMetricAcrossLayers({
      id: "outstanding_receivables",
      label: "Outstanding receivables (₹)",
      expected: expectedOutstandingReceivables,
      layers: {
        browserRls: browser.arOutstanding,
        dbComputed: browser.arOutstanding,
        apiPayload: numOrNull(apiExecutive.outstandingReceivables),
        uiRendered: numOrNull(uiExecutive.outstandingReceivables),
      },
    }),
    checkMetricAcrossLayers({
      id: "recent_visits",
      label: "Recent visits count",
      expected: expected.recentVisits,
      layers: {
        browserRls: browser.visitsRowCount,
        dbComputed: browser.visitsRowCount,
        apiPayload: numOrNull(apiSummary.recentVisits),
        uiRendered: numOrNull(uiSummary.recentVisits),
      },
    }),
    checkMetricAcrossLayers({
      id: "inventory_skus",
      label: "Inventory SKU count",
      expected: expected.inventorySkus,
      layers: {
        browserRls: browser.inventorySkus,
        dbComputed: browser.inventorySkus,
        apiPayload: numOrNull(apiStock.totalSkus),
        uiRendered: numOrNull(uiStock.totalSkus),
      },
    }),
    checkMetricAcrossLayers({
      id: "total_sold_value",
      label: "Total sold value (₹, fulfilled)",
      expected: expected.totalSoldValue,
      layers: {
        browserRls: browser.totalSoldValue,
        dbComputed: browser.totalSoldValue,
        apiPayload: numOrNull(apiSummary.totalSoldValue),
        uiRendered: numOrNull(uiSummary.totalSoldValue),
      },
    }),
  ];

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
  };

  if (printReport) {
    printQaValidationReport(report);
  }

  report.layerSnapshot = {
    ordersRowCount: browser.ordersRowCount,
    arOutstanding: browser.arOutstanding,
    visitsRowCount: browser.visitsRowCount,
    inventorySkus: browser.inventorySkus,
    totalSoldValue: browser.totalSoldValue,
    apiOutstanding: numOrNull(apiExecutive.outstandingReceivables),
    apiRecentVisits: numOrNull(apiSummary.recentVisits),
    apiInventorySkus: numOrNull(apiStock.totalSkus),
    apiTotalSold: numOrNull(apiSummary.totalSoldValue),
    uiOutstanding: numOrNull(uiExecutive.outstandingReceivables),
    uiRecentVisits: numOrNull(uiSummary.recentVisits),
    uiInventorySkus: numOrNull(uiStock.totalSkus),
    uiTotalSold: numOrNull(uiSummary.totalSoldValue),
  };

  return report;
}

export { printQaValidationReport, QA_ADMIN_DASHBOARD_SEED };
