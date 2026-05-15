/**
 * Canonical map: surfaces → APIs → metric engines → Supabase relations.
 * For observability and onboarding — not exhaustive of every SELECT column.
 * @type {Record<string, { ui: string[], api: string[], engine: string, tables: string[] }>}
 */
export const METRIC_DEPENDENCY_GRAPH = {
  todaysRevenue: {
    ui: ["AdminDashboard", "ExecutiveControlTower"],
    api: ["getAdminDashboardRead", "primecareApi.getExecutiveSnapshot fallback"],
    engine: "computeRevenueMetrics",
    tables: ["orders", "order_items"],
  },
  totalSoldValue: {
    ui: ["AdminDashboard", "DashboardPage", "ExecutiveControlTower"],
    api: ["getAdminDashboardRead", "getDashboard fallback"],
    engine: "computeRevenueMetrics",
    tables: ["orders", "order_items"],
  },
  topLabsByRevenue: {
    ui: ["AdminDashboard"],
    api: ["getAdminDashboardRead", "primecareApi.getExecutiveSnapshot fallback"],
    engine: "computeRevenueMetrics (revenueByLab slice)",
    tables: ["orders", "order_items", "labs"],
  },
  outstandingReceivablesTotal: {
    ui: ["AdminDashboard", "ExecutiveControlTower"],
    api: ["getAdminDashboardRead", "getExecutiveSnapshot fallback"],
    engine: "computeReceivableMetrics",
    tables: ["ar_credit_control"],
  },
  labsAtCreditRisk: {
    ui: ["AdminDashboard"],
    api: ["getAdminDashboardRead", "primecare merge countLabsCreditRiskFromCreditView / getLabsCredit"],
    engine: "computeReceivableMetrics (AR) | countLabsCreditRiskFromCreditView (labs view)",
    tables: ["ar_credit_control", "v_labs_credit"],
  },
  collectionsSummary: {
    ui: ["CollectionsPage"],
    api: ["getCollectionsRead"],
    engine: "summarizeCollectionsList",
    tables: ["ar_credit_control", "payments", "v_labs_credit"],
  },
  inventoryBuckets: {
    ui: ["AdminDashboard", "StockPage", "ExecutiveControlTower"],
    api: ["getAdminDashboardRead", "getStockDashboard"],
    engine: "rollupInventoryTableRows | rollupStockDashboardMappedItems",
    tables: ["inventory", "v_stock_dashboard"],
  },
  productsNearStockout: {
    ui: ["AdminDashboard"],
    api: ["getAdminDashboardRead", "merge: computeNearStockoutMergeDerived"],
    engine: "productsNearStockoutFromInventoryStats + merge forecast MAX",
    tables: ["inventory", "reorder_forecast reads via getReorderForecastRead"],
  },
  labsPortfolioSummary: {
    ui: ["LabsPage"],
    api: ["getLabsCredit"],
    engine: "summarizeLabsCreditPortfolio",
    tables: ["v_labs_credit"],
  },
  agentCreditBuckets: {
    ui: ["AgentDashboard"],
    api: ["getAgentWorkspaceRead", "deriveCreditTierFromLabRecord"],
    engine: "summarizeAgentLabsCreditBuckets",
    tables: ["v_labs_credit", "ar_credit_control"],
  },
  aiInsightsSignals: {
    ui: ["AIInsightsPage"],
    api: ["getAdminDashboardRead (DEV) → buildDashboardInsightsFromMetrics | getAIInsights"],
    engine: "buildDashboardInsightsFromMetrics",
    tables: ["orders", "order_items", "ar_credit_control", "inventory"],
  },
  ordersBrowse: {
    ui: ["OrdersPage"],
    api: ["getOrdersRead", "getOrderDetailsRead"],
    engine: "(list/detail mapping only — revenue uses computeRevenueMetrics indirectly N/A)",
    tables: ["orders", "order_items"],
  },
};

export function formatMetricDependencyTrail(metricKey) {
  const row = METRIC_DEPENDENCY_GRAPH[metricKey];
  if (!row) return `${metricKey}: (not catalogued)`;
  return [
    `${metricKey}`,
    `  UI ← ${row.ui.join(", ")}`,
    `  API ← ${row.api.join(", ")}`,
    `  Engine ← ${row.engine}`,
    `  Tables ← ${row.tables.join(", ")}`,
  ].join("\n");
}
