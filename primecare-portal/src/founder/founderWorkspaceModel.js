/**
 * Phase 9.2 — Founder OS workspace derivations (read-only compose).
 */
import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { buildFounderDecisionQueue } from "@/founder/founderDecisionQueueEngine.js";
import { buildFounderInsights } from "@/founder/founderInsightsEngine.js";
import { buildFounderPriorities } from "@/founder/founderPrioritiesEngine.js";
import { buildFounderPerformanceCards } from "@/founder/founderPerformanceCardsEngine.js";
import { buildApprovalInbox } from "@/peopleOps/productivity/peopleOpsProductivityModel.js";
import { FOUNDER_DEEP_LINK_PAGES } from "@/founder/founderOperatingNavigation.js";

function str(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatInr(value) {
  return `₹${num(value).toLocaleString("en-IN")}`;
}

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isPendingOrder(order = {}) {
  const s = str(order.orderStatus ?? order.status).toLowerCase();
  return s !== "fulfilled" && s !== "cancelled" && s !== "delivered";
}

function inventoryRows(payload = {}) {
  return payload.inventory || payload.dashboard?.inventory || [];
}

export function buildFounderTodaysBusiness(readBundle = {}) {
  const snapshot = readBundle.dailySnapshot || {};
  const summary = readBundle.opsPayload?.dashboard?.summary || {};
  const executive = readBundle.opsPayload?.dashboard?.executive || {};
  const compensation = readBundle.compensationModel || {};
  const commercial = readBundle.commercialWorkspace || {};
  const todayYmd = localDateYmd();

  const ordersToday = (readBundle.opsPayload?.orders || []).filter(
    (o) => str(o.orderDate || o.order_date || o.created_at).slice(0, 10) === todayYmd
  ).length;

  const newLabsToday = (readBundle.commercialRaw?.qualifications || []).filter((q) => {
    const updated = str(q.updatedAt || q.updated_at || q.created_at).slice(0, 10);
    const stage = str(q.pipelineStage || q.pipeline_stage).toLowerCase();
    return updated === todayYmd && (stage === "new" || stage === "qualified");
  }).length;

  const deliveriesToday = (readBundle.opsPayload?.orders || []).filter((o) => {
    const s = str(o.orderStatus ?? o.status).toLowerCase();
    const d = str(o.deliveredAt || o.delivered_at || o.updated_at).slice(0, 10);
    return d === todayYmd && (s.includes("deliver") || s.includes("fulfill"));
  }).length;

  const collSummary = summarizeCollectionsList(
    readBundle.opsPayload?.collections || [],
    num(summary.todayCollections)
  );

  const stockStats = summary.stockStats || {};
  const criticalStock = num(stockStats.criticalItems ?? executive.productsNearStockout);

  const latestPeriod = compensation.periodRows?.[0];
  const payrollStatus = latestPeriod
    ? `${str(latestPeriod.periodYm)} · ${str(latestPeriod.status)}`
    : "No payroll period loaded";

  return {
    todayRevenue: snapshot.revenueToday || formatInr(executive.todaysRevenue),
    todayCollections: formatInr(collSummary.todayCollections),
    todayOrders: ordersToday,
    todayNewLabs: newLabsToday,
    todayDeliveries: deliveriesToday,
    cashPosition: snapshot.collectionsExposure || formatInr(collSummary.totalOutstanding),
    payrollStatus,
    outstandingCollections: formatInr(collSummary.totalOutstanding),
    inventoryHealth:
      criticalStock > 0 ? `${criticalStock} critical SKU(s)` : "Within thresholds",
    pipelineValue: commercial.kpis?.pipelineValueLabel || "—",
    conversion: commercial.kpis?.conversionRateLabel || "—",
    previewOnly: true,
  };
}

export function buildFounderRevenueSection(readBundle = {}) {
  const commercial = readBundle.commercialWorkspace || {};
  const snapshot = readBundle.dailySnapshot || {};
  return {
    currentMonthRevenue: snapshot.revenueToday || "—",
    forecastRevenue: commercial.forecast?.expectedRevenueLabel || commercial.kpis?.forecastRevenueLabel || "—",
    pipelineValue: commercial.kpis?.pipelineValueLabel || "—",
    conversion: commercial.kpis?.conversionRateLabel || "—",
    lostRevenueLabs: commercial.reports?.lostLabs?.slice(0, 5) || [],
    topGrowthLabs: commercial.reports?.growthLabs?.slice(0, 5) || [],
    topRisks: (commercial.pipelineBoard || [])
      .filter((row) => row.id === "lost" || row.id === "negotiation")
      .flatMap((row) => row.labs || [])
      .slice(0, 5),
    deepLinkPage: FOUNDER_DEEP_LINK_PAGES.efi,
    commercialDeepLink: FOUNDER_DEEP_LINK_PAGES.commercial,
  };
}

export function buildFounderCollectionsSection(readBundle = {}) {
  const collections = readBundle.opsPayload?.collections || [];
  const summary = readBundle.opsPayload?.dashboard?.summary || {};
  const collSummary = summarizeCollectionsList(collections, num(summary.todayCollections));

  const largestRisks = [...collections]
    .sort((a, b) => num(b.outstandingAmount) - num(a.outstandingAmount))
    .slice(0, 8)
    .map((row) => ({
      labName: str(row.labName || row.lab_name) || "—",
      outstanding: formatInr(row.outstandingAmount),
      overdueDays: num(row.overdueDays),
      risk: str(row.riskStatus) || "—",
    }));

  return {
    collectedToday: formatInr(collSummary.todayCollections),
    outstanding: formatInr(collSummary.totalOutstanding),
    overdueCount: collSummary.overdueCount,
    highRiskCount: collSummary.highRiskCount,
    largestRisks,
    cashForecastNote: "Cash forecast uses Commercial forecast collections proxy — open Commercial → Forecast.",
    deepLinkPage: FOUNDER_DEEP_LINK_PAGES.collections,
  };
}

export function buildFounderOperationsSection(readBundle = {}) {
  const orders = readBundle.opsPayload?.orders || [];
  const pending = orders.filter(isPendingOrder);
  const delayed = pending.filter((o) => num(o.daysOpen ?? o.days_open) > 3);
  const purchaseOrders = readBundle.opsPayload?.purchaseOrders || [];
  const openPo = purchaseOrders.filter((po) => {
    const s = str(po.status).toLowerCase();
    return s !== "received" && s !== "closed" && s !== "cancelled";
  });

  const inv = inventoryRows(readBundle.opsPayload);
  const lowStock = inv.filter((row) => num(row.currentStock ?? row.current_stock) <= num(row.reorderLevel ?? row.reorder_level));

  return {
    ordersWaiting: pending.length,
    shipmentsDelayed: delayed.length,
    procurementDelays: openPo.length,
    inventoryExceptions: lowStock.length,
    systemAlerts: (readBundle.priorityCards || []).filter((c) => num(c.count) > 0).length,
    deepLinkOrders: FOUNDER_DEEP_LINK_PAGES.orders,
    deepLinkOps: FOUNDER_DEEP_LINK_PAGES.operations,
    deepLinkPurchase: FOUNDER_DEEP_LINK_PAGES.purchase,
  };
}

export function buildFounderPeopleSection(readBundle = {}) {
  const model = readBundle.compensationModel || {};
  const profiles = model.profiles || readBundle.compensationRaw?.profiles || [];
  const assignments = readBundle.compensationRaw?.planAssignments || [];

  const activeProfiles = profiles.filter((p) => p.active !== false);
  const withoutPlan = activeProfiles.filter((profile) => {
    const uid = str(profile.user_id);
    return !assignments.some(
      (a) => str(a.profile_user_id) === uid && str(a.assignment_status) === "active"
    );
  });

  return {
    headcount: activeProfiles.length,
    payrollStatus: model.periodRows?.[0]?.status || "—",
    employeesWithoutPlans: withoutPlan.length,
    pendingApprovals: buildApprovalInbox({ model, adminModel: model.adminModel }).length,
    promotionReviews: (model.promotionPipelineRows || []).length,
    deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
  };
}

export function buildFounderInventorySection(readBundle = {}) {
  const inv = inventoryRows(readBundle.opsPayload);
  const low = inv.filter((row) => num(row.currentStock ?? row.current_stock) <= num(row.reorderLevel ?? row.reorder_level));
  const sorted = [...inv].sort(
    (a, b) => num(b.currentStock ?? b.current_stock) - num(a.currentStock ?? a.current_stock)
  );
  const fast = sorted.slice(0, 5);
  const slow = [...inv]
    .sort((a, b) => num(a.currentStock ?? a.current_stock) - num(b.currentStock ?? b.current_stock))
    .slice(0, 5);

  return {
    lowStockCount: low.length,
    fastMoving: fast.map((r) => ({
      name: str(r.productName || r.product_name) || str(r.productId),
      stock: num(r.currentStock ?? r.current_stock),
    })),
    slowMoving: slow.map((r) => ({
      name: str(r.productName || r.product_name) || str(r.productId),
      stock: num(r.currentStock ?? r.current_stock),
    })),
    purchaseRequired: low.length,
    blockedItems: inv.filter((r) => str(r.status).toLowerCase() === "blocked").length,
    deepLinkPage: FOUNDER_DEEP_LINK_PAGES.inventory,
  };
}

export function buildFounderGrowthSection(readBundle = {}) {
  const commercial = readBundle.commercialWorkspace || {};
  return {
    pipeline: commercial.pipelineBoard || [],
    meetingsThisWeek: commercial.kpis?.meetingsThisWeek ?? 0,
    contractsPending: commercial.kpis?.contractsPending ?? 0,
    activated: commercial.kpis?.labsActivated ?? 0,
    agentPerformance: (commercial.agentPerformance || []).slice(0, 8),
    forecast: commercial.forecast || {},
    deepLinkPage: FOUNDER_DEEP_LINK_PAGES.commercial,
  };
}

export function buildFounderRisksSection(readBundle = {}) {
  const insights = readBundle.insights?.items || [];
  const decisions = readBundle.decisionQueue?.items || [];

  const aggregated = [
    ...insights.map((row) => ({
      id: row.id,
      domain: row.type,
      title: row.title,
      reason: row.reason,
      impact: row.impact,
      deepLinkPage: row.actionPage,
    })),
    ...decisions
      .filter((d) => ["critical", "high", "attention", "warning"].includes(str(d.severity).toLowerCase()))
      .map((row) => ({
        id: row.id,
        domain: row.category,
        title: row.title,
        reason: row.reason,
        impact: row.businessImpact,
        deepLinkPage: row.deepLinkPage,
      })),
  ];

  const unique = [];
  const seen = new Set();
  for (const row of aggregated) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }

  return {
    items: unique.slice(0, 20),
    count: unique.length,
  };
}

export function buildFounderApprovalsSection(readBundle = {}) {
  const items = buildApprovalInbox({
    model: readBundle.compensationModel,
    adminModel: readBundle.compensationModel?.adminModel,
  });
  return {
    items,
    count: items.length,
    deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
  };
}

export function buildFounderForecastSection(readBundle = {}) {
  const commercial = readBundle.commercialWorkspace || {};
  return {
    commercialForecast: commercial.forecast || {},
    payrollForecastNote: "Payroll forecast — People Operations → Reports (preview only).",
    deepLinkCommercial: FOUNDER_DEEP_LINK_PAGES.commercial,
    deepLinkPeople: FOUNDER_DEEP_LINK_PAGES.people,
  };
}

/**
 * Full Founder workspace model from read bundle.
 */
export function buildFounderWorkspace(readBundle = {}) {
  const decisionQueue = buildFounderDecisionQueue({
    actionQueue: readBundle.actionQueue,
    compensationModel: readBundle.compensationModel,
    priorityCards: readBundle.priorityCards,
    contracts: readBundle.commercialRaw?.contracts,
  });

  const insights = buildFounderInsights({
    dailySnapshot: readBundle.dailySnapshot,
    opsPayload: readBundle.opsPayload,
    commercialWorkspace: readBundle.commercialWorkspace,
    compensationModel: readBundle.compensationModel,
    actionQueue: readBundle.actionQueue,
  });

  const enriched = { ...readBundle, decisionQueue, insights };
  const priorities = buildFounderPriorities(enriched);
  const performanceCards = buildFounderPerformanceCards(readBundle);

  return {
    previewOnly: true,
    readOnly: true,
    canonicalSources: [
      "operationsCommandCenterLoader",
      "commercialWorkspaceRead",
      "compensationReadSupabaseApi",
      "executiveActionQueueEngine",
      "founderInsightsEngine",
    ],
    todaysBusiness: buildFounderTodaysBusiness(readBundle),
    decisionQueue,
    priorities,
    insights,
    revenue: buildFounderRevenueSection(readBundle),
    collections: buildFounderCollectionsSection(readBundle),
    operations: buildFounderOperationsSection(readBundle),
    people: buildFounderPeopleSection(readBundle),
    inventory: buildFounderInventorySection(readBundle),
    growth: buildFounderGrowthSection(readBundle),
    risks: buildFounderRisksSection({ ...readBundle, decisionQueue, insights }),
    approvals: buildFounderApprovalsSection(readBundle),
    forecast: buildFounderForecastSection(readBundle),
    performanceCards,
    loadedAt: readBundle.loadedAt,
  };
}
