/** Stable DOM anchors for Admin Dashboard KPI validation (Predator + QA). */
export const ADMIN_DASHBOARD_KPI_TEST_IDS = {
  orders_count: "admin-kpi-orders-count",
  inventory_skus: "admin-kpi-inventory-skus",
  outstanding_receivables: "admin-kpi-outstanding-receivables",
  total_sold_value: "admin-kpi-total-sold-value",
};

/**
 * Parse a rendered KPI value from DOM text or data-kpi-value.
 * @param {string|null|undefined} raw
 */
export function parseAdminDashboardKpiDomValue(raw) {
  const cleaned = String(raw ?? "")
    .replace(/[₹,\s]/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read one KPI from the live Admin Dashboard DOM.
 * @param {string} testId
 */
export function readAdminDashboardDomKpi(testId) {
  if (typeof document === "undefined" || !testId) return null;
  const el = document.querySelector(`[data-testid="${testId}"]`);
  if (!el) return null;
  const raw = el.getAttribute("data-kpi-value") ?? el.textContent;
  return parseAdminDashboardKpiDomValue(raw);
}

/**
 * Read all Admin Dashboard KPI cards that expose data-testid anchors.
 */
export function readAdminDashboardDomKpis() {
  return {
    orders_count: readAdminDashboardDomKpi(ADMIN_DASHBOARD_KPI_TEST_IDS.orders_count),
    inventory_skus: readAdminDashboardDomKpi(ADMIN_DASHBOARD_KPI_TEST_IDS.inventory_skus),
    outstanding_receivables: readAdminDashboardDomKpi(
      ADMIN_DASHBOARD_KPI_TEST_IDS.outstanding_receivables
    ),
    total_sold_value: readAdminDashboardDomKpi(ADMIN_DASHBOARD_KPI_TEST_IDS.total_sold_value),
  };
}

/**
 * Whether any anchored Admin Dashboard KPI is visible in the DOM.
 */
export function hasAdminDashboardDomKpis() {
  const dom = readAdminDashboardDomKpis();
  return Object.values(dom).some((value) => value !== null);
}
