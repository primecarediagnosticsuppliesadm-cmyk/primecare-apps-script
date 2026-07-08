/**
 * Phase 9.2 — Rule-based Founder Insights (no AI/ML; existing data only).
 */
import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";

function str(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {{
 *   dailySnapshot?: object,
 *   opsPayload?: object,
 *   commercialWorkspace?: object,
 *   compensationModel?: object,
 *   actionQueue?: object,
 * }} input
 */
export function buildFounderInsights(input = {}) {
  const insights = [];
  const snapshot = input.dailySnapshot || {};
  const collections = input.opsPayload?.collections || [];
  const collSummary = summarizeCollectionsList(
    collections,
    num(input.opsPayload?.dashboard?.summary?.todayCollections)
  );
  const commercial = input.commercialWorkspace || {};
  const kpis = commercial.kpis || {};
  const compensation = input.compensationModel || {};

  if (num(snapshot.revenueTodayRaw) <= 0 && num(snapshot.ordersPendingFulfillment) > 0) {
    insights.push({
      id: "revenue-miss-risk",
      type: "financial",
      title: "Revenue likely below today's pace",
      reason: "Orders are open but fulfilled revenue today is ₹0.",
      impact: "high",
      actionPage: "orders",
      actionLabel: "Review Orders",
    });
  }

  if (num(collSummary.overdueCount) >= 3 || num(collSummary.highRiskCount) >= 2) {
    insights.push({
      id: "collections-slowing",
      type: "financial",
      title: "Collections slowing",
      reason: `${collSummary.overdueCount} overdue account(s); ${collSummary.highRiskCount} high-risk lab(s).`,
      impact: "high",
      actionPage: "risk",
      actionLabel: "Credit & Risk",
    });
  }

  const lowStock = num(snapshot.lowStockSkus);
  if (lowStock > 0) {
    insights.push({
      id: "inventory-low",
      type: "inventory",
      title: "Inventory below safety threshold",
      reason: `${lowStock} SKU(s) flagged low or critical.`,
      impact: "high",
      actionPage: "inventory",
      actionLabel: "Inventory",
    });
  }

  const slowAgents = (commercial.agentPerformance || []).filter((row) => row.visits === 0 && row.growthLabs === 0);
  if (slowAgents.length >= 2) {
    insights.push({
      id: "agent-underperform",
      type: "commercial",
      title: "Agent underperformance signal",
      reason: `${slowAgents.length} agent(s) with no visits or growth labs in current read window.`,
      impact: "medium",
      actionPage: "commercialCrm",
      actionLabel: "Commercial",
    });
  }

  const renewals = (commercial.contracts || commercial.mappedContracts || []).filter((row) => {
    const end = str(row.renewalDate || row.endDate || row.end_date).slice(0, 10);
    if (!end) return false;
    const days = Math.floor((new Date(end) - new Date()) / 86400000);
    return days >= 0 && days <= 45;
  });
  if (renewals.length > 0) {
    insights.push({
      id: "contract-renewal-risk",
      type: "commercial",
      title: "Contract renewal risk",
      reason: `${renewals.length} contract(s) renewing within 45 days.`,
      impact: "high",
      actionPage: "labContractEngine",
      actionLabel: "Contracts",
    });
  }

  const lostCount = num(kpis.lostLabs ?? commercial.pipelineBoard?.find((r) => r.id === "lost")?.count);
  if (lostCount >= 3) {
    insights.push({
      id: "lab-churn-risk",
      type: "commercial",
      title: "Lab churn risk in pipeline",
      reason: `${lostCount} lab(s) in lost stage.`,
      impact: "medium",
      actionPage: "commercialCrm",
      actionLabel: "Commercial Pipeline",
    });
  }

  const conversionPct = num(String(kpis.conversionRateLabel || "").replace(/[^\d.]/g, ""));
  if (conversionPct > 0 && conversionPct < 15) {
    insights.push({
      id: "growth-opportunity",
      type: "commercial",
      title: "Rapid growth opportunity",
      reason: `Pipeline conversion ${kpis.conversionRateLabel} — qualified labs may need executive push.`,
      impact: "medium",
      actionPage: "commercialCrm",
      actionLabel: "Growth Pipeline",
    });
  }

  if (num(compensation.pendingPayrollPeriods) > 0) {
    insights.push({
      id: "payroll-pending",
      type: "people",
      title: "Payroll decision pending",
      reason: `${compensation.pendingPayrollPeriods} payroll period(s) awaiting workflow completion.`,
      impact: "high",
      actionPage: "compensationPayroll",
      actionLabel: "People Operations",
    });
  }

  const openQueue = num(input.actionQueue?.counts?.open);
  if (openQueue >= 5) {
    insights.push({
      id: "ops-backlog",
      type: "operational",
      title: "Operational decision backlog",
      reason: `${openQueue} open executive action queue item(s).`,
      impact: "medium",
      actionPage: "operationsCenter",
      actionLabel: "Operations Center",
    });
  }

  return {
    items: insights,
    count: insights.length,
    previewOnly: true,
    noAi: true,
  };
}
