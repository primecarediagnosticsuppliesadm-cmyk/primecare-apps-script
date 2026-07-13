/**
 * Phase 9.1 — Platform consolidation registry.
 * Navigation ownership, dashboard KPI ownership, report routing, KPI calculation SoT.
 * No finance/payroll logic — metadata only.
 */

/** Sidebar-hidden keys; routes remain permissioned for deep-links and legacy URLs. */
export const NAV_DEEP_LINK_ONLY_KEYS = new Set([
  "qualificationReview",
  "founderNavigation",
  "founderStrategy",
  "founderFinancialIntelligence",
  "commissionEngine",
  "labContractEngine",
  "pilotReadiness",
]);

/** Primary workspace home per domain (canonical menu entry). */
export const PLATFORM_WORKSPACE_HOMES = {
  founder: "founderOperatingSystem",
  commercial: "commercialCrm",
  people: "compensationPayroll",
  operations: "operationsCenter",
  executive: "dashboard",
  finance: "risk",
  inventory: "inventory",
  procurement: "purchase",
};

/**
 * Dashboard KPI ownership — each KPI has exactly one primary dashboard.
 * @type {Record<string, { primaryDashboard: string, calculationSource: string, deepLinks?: string[] }>}
 */
export const DASHBOARD_KPI_OWNERSHIP = {
  pipeline_stage_count: {
    primaryDashboard: "commercialCrm",
    calculationSource: "commercialWorkspaceModel.buildCommercialPipelineBoard",
    deepLinks: ["qualificationReview"],
  },
  qualification_band_distribution: {
    primaryDashboard: "commercialCrm",
    calculationSource: "getQualificationReviewRead + commercialWorkspaceModel",
    deepLinks: ["qualificationReview"],
  },
  commercial_forecast_proxy: {
    primaryDashboard: "commercialCrm",
    calculationSource: "commercialWorkspaceModel.buildCommercialForecast",
  },
  revenue_funnel_integrity: {
    primaryDashboard: "revenueFunnel",
    calculationSource: "revenueFunnelEngine.buildRevenueFunnelModel",
    deepLinks: ["commercialCrm"],
  },
  cash_collected_period: {
    primaryDashboard: "executiveFinancialIntelligence",
    calculationSource: "executiveFinancialIntelligenceEngine + payments.amount_received",
  },
  outstanding_ar: {
    primaryDashboard: "executiveFinancialIntelligence",
    calculationSource: "ar_credit_control.outstanding + collectionsCockpitMetrics",
    deepLinks: ["risk"],
  },
  invoice_aging: {
    primaryDashboard: "risk",
    calculationSource: "collectionsCockpitMetrics + invoiceAccountStatus",
  },
  payroll_run_status: {
    primaryDashboard: "compensationPayroll",
    calculationSource: "executiveCompensationModel + payrollDomainSupabaseApi",
  },
  commission_cash_collected: {
    primaryDashboard: "compensationPayroll",
    calculationSource: "compensationCalculationEngine (cash-only)",
    deepLinks: ["commissionEngine"],
  },
  workforce_budget_envelope: {
    primaryDashboard: "compensationPayroll",
    calculationSource: "workforceBudgetingModel",
  },
  ownership_territory_coverage: {
    primaryDashboard: "compensationPayroll",
    calculationSource: "businessOwnershipModel + labOwnershipEngine",
  },
  stock_on_hand_value: {
    primaryDashboard: "inventory",
    calculationSource: "inventoryValueAnalyticsEngine + inventory.current_stock",
  },
  open_purchase_orders: {
    primaryDashboard: "purchase",
    calculationSource: "purchase_orders bounded read",
  },
  ops_action_queue_depth: {
    primaryDashboard: "operationsCenter",
    calculationSource: "executiveActionQueueEngine",
    deepLinks: ["dashboard"],
  },
  intervention_backlog: {
    primaryDashboard: "dashboard",
    calculationSource: "ExecutiveControlTower + executiveInterventionModel",
    deepLinks: ["operationsCenter"],
  },
  admin_order_fulfillment_kpi: {
    primaryDashboard: "dashboard",
    calculationSource: "adminDashboardState (admin role)",
    deepLinks: ["orders"],
  },
};

/**
 * Report ownership — one primary module per report surface.
 * @type {Record<string, { module: string, screen: string, duplicatesRemoved?: string[] }>}
 */
export const REPORT_OWNERSHIP = {
  commercial_pipeline_report: {
    module: "commercialCrm",
    screen: "reports/analytics",
    duplicatesRemoved: ["qualificationReview"],
  },
  commercial_agent_performance: {
    module: "commercialCrm",
    screen: "reports/analytics",
  },
  people_ops_analytics: {
    module: "compensationPayroll",
    screen: "reports/analytics",
    duplicatesRemoved: ["commissionEngine"],
  },
  people_ops_payroll_export: {
    module: "compensationPayroll",
    screen: "payroll/exports",
  },
  executive_financial_intelligence: {
    module: "executiveFinancialIntelligence",
    screen: "all",
    duplicatesRemoved: ["founderFinancialIntelligence"],
  },
  revenue_funnel_integrity_report: {
    module: "revenueFunnel",
    screen: "main",
  },
  collections_ar_report: {
    module: "risk",
    screen: "collections",
  },
  inventory_valuation_report: {
    module: "inventory",
    screen: "dashboard",
  },
  operations_audit_report: {
    module: "accessAudit",
    screen: "main",
  },
};

/**
 * Financial intelligence KPI calculation sources (single SoT per metric family).
 */
export const FINANCIAL_KPI_SOURCES = {
  revenue: {
    source: "executiveFinancialIntelligenceEngine",
    inputs: ["invoices", "orders (fulfilled)"],
    notSource: ["commissionEngine", "revenueFunnel (lab counts)"],
  },
  collections: {
    source: "collectionsCockpitMetrics + payments + invoice_payment_allocations",
    inputs: ["payments.amount_received", "ar_credit_control"],
    notSource: ["Commission Engine collected proxy"],
  },
  payroll: {
    source: "payrollDomainSupabaseApi + compensationCalculationEngine",
    inputs: ["payments.amount_received (cash-only)"],
    notSource: ["commissionEngine", "founderFinancialIntelligence"],
  },
  inventory: {
    source: "inventoryValueAnalyticsEngine",
    inputs: ["inventory", "inventory_ledger", "resolveInventoryUnitCost"],
    notSource: ["master catalog list without inventory join"],
  },
  procurement: {
    source: "purchase_orders bounded read + receivePurchaseOrderWrite ledger",
    inputs: ["purchase_orders", "inventory_ledger"],
  },
  compensation: {
    source: "compensationCalculationEngine + executiveCompensationModel",
    inputs: ["payments", "compensation_attribution_snapshots"],
    notSource: ["commissionEngine revenue attribution"],
  },
  forecast: {
    source: "commercialWorkspaceModel.buildCommercialForecast (growth); compensation forecastMetrics (payroll)",
    note: "Growth forecast ≠ payroll forecast — separate grains by design",
  },
};

/** Notification grouping for Phase 9.1 audit (no backend changes). */
export const NOTIFICATION_GROUPS = {
  critical: ["credit_hold_triggered", "low_stock"],
  warning: ["collection_due"],
  information: ["order_created", "order_fulfilled", "payment_received", "agent_visit_logged", "qualification_updated"],
  tasks: ["purchase_order_created", "purchase_order_received"],
  approvals: [],
  futureAutomation: ["email_placeholder", "whatsapp_placeholder", "sms_placeholder"],
};

/** Technical debt registry (priority-ordered). */
export const TECH_DEBT_REGISTRY = [
  {
    id: "TD-GOD-COLLECTIONS",
    priority: "high",
    area: "CollectionsPage.jsx",
    lines: 3243,
    issue: "God page — finance + agent + HQ + drawers",
  },
  {
    id: "TD-GOD-AGENT-VISIT",
    priority: "high",
    area: "AgentVisitPage.jsx",
    lines: 3082,
    issue: "Field wizard monolith",
  },
  {
    id: "TD-GOD-PEOPLE-OPS",
    priority: "high",
    area: "ExecutiveCompensationCenterPage.jsx",
    lines: 1381,
    issue: "Entire People Ops product in one file",
  },
  {
    id: "TD-SCHEMA-DRIFT",
    priority: "high",
    area: "supabase/migrations vs sql/",
    issue: "GAP-BP-001 unclear apply order",
  },
  {
    id: "TD-PROJECTION-SHADOW",
    priority: "high",
    area: "projectionOpsCatalog.json",
    issue: "Read adapters in shadow; flags OFF",
  },
  {
    id: "TD-DUAL-ORDER-LINES",
    priority: "medium",
    area: "order_items + order_lines",
    issue: "GAP-BP-002 dual model",
  },
  {
    id: "TD-EFI-FOUNDER-DUP",
    priority: "medium",
    area: "EFI + Founder FI",
    issue: "Overlapping financial intelligence engines",
  },
  {
    id: "TD-COMMISSION-PAYROLL",
    priority: "medium",
    area: "Commission Engine nav",
    issue: "Growth analytics exposed beside payroll SoT",
  },
  {
    id: "TD-API-MONOLITH",
    priority: "medium",
    area: "primecareSupabaseApi.js",
    issue: "Monolithic API vs domain APIs",
  },
  {
    id: "TD-CATALOG-INVENTORY",
    priority: "low",
    area: "Master catalog create",
    issue: "GAP-BP-009 catalog seeds inventory",
  },
];

/** Largest pages for performance audit. */
export const LARGEST_PAGE_COMPONENTS = [
  { file: "CollectionsPage.jsx", lines: 3243 },
  { file: "AgentVisitPage.jsx", lines: 3082 },
  { file: "LabOrderingPage.jsx", lines: 2389 },
  { file: "PurchaseOrdersPage.jsx", lines: 2103 },
  { file: "OrdersPage.jsx", lines: 1759 },
  { file: "AdminDashboard.jsx", lines: 1691 },
  { file: "ExecutiveCompensationCenterPage.jsx", lines: 1381 },
  { file: "ExecutiveControlTower.jsx", lines: 1233 },
  { file: "QualificationReviewPage.jsx", lines: 1232 },
];

export function isDeepLinkOnlyNavKey(pageKey) {
  return NAV_DEEP_LINK_ONLY_KEYS.has(String(pageKey || ""));
}

export function getWorkspaceHome(domain) {
  return PLATFORM_WORKSPACE_HOMES[domain] || null;
}
