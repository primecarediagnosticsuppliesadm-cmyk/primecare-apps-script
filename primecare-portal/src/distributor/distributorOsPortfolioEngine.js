/**
 * Distributor OS V2 portfolio — dashboard, performance, comparison.
 */

import { buildDistributorBillingRow, rollupPortfolioBilling } from "@/distributor/distributorBillingEngine.js";
import {
  contractExpiryState,
  enrichRegistryRowLifecycle,
  LIFECYCLE_STATUS,
  resolveDistributorLifecycleStatus,
} from "@/distributor/distributorLifecycleEngine.js";
import {
  collectDistributorLabIds,
  filterRowsByDistributorLabs,
  filterRowsByTenant,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";
import { labIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

function sumCollections(rows = []) {
  return rows.reduce((s, r) => s + num(r.outstandingAmount ?? r.outstanding ?? r.amount), 0);
}

function sumOrderValue(rows = []) {
  return rows.reduce((s, r) => s + num(r.totalAmount ?? r.orderValue ?? r.amount), 0);
}

function countActiveLabs(labs = []) {
  return labs.filter((l) => str(l.status).toLowerCase() !== "inactive").length;
}

/**
 * Per-distributor metrics from filtered operational rows.
 */
export function computeDistributorMetrics(tenantId, { labs = [], orders = [], collections = [] } = {}) {
  const scopedLabs = filterRowsByTenant(labs, tenantId);
  const labIds = collectDistributorLabIds(scopedLabs, tenantId);
  let scopedOrders = filterRowsByTenant(orders, tenantId);
  if (!scopedOrders.length && labIds.size) {
    scopedOrders = orders.filter((o) => labIds.has(labIdKey(o.labId ?? o.lab_id)));
  }
  let scopedCollections = filterRowsByTenant(collections, tenantId);
  if (!scopedCollections.length && labIds.size) {
    scopedCollections = filterRowsByDistributorLabs(collections, labIds, "labId");
  }

  const collectionsTotal = sumCollections(scopedCollections);
  const revenue = sumOrderValue(scopedOrders);
  const activeLabs = countActiveLabs(scopedLabs);
  const collectedPlusOutstanding = collectionsTotal;
  const collectionEfficiencyPct =
    collectedPlusOutstanding > 0 ? Math.min(100, Math.round((revenue / (revenue + collectionsTotal)) * 100)) : 0;

  return {
    labs: scopedLabs.length,
    activeLabs,
    orders: scopedOrders.length,
    collections: scopedCollections.length,
    collectionsTotal,
    revenue,
    outstanding: collectionsTotal,
    collectionEfficiencyPct,
    labsRows: scopedLabs,
    ordersRows: scopedOrders,
    collectionsRows: scopedCollections,
  };
}

export function buildDistributorPerformanceRow(distributorRow, metrics = {}, extras = {}) {
  const enriched = enrichRegistryRowLifecycle(distributorRow);
  const healthScore = num(enriched.healthScore ?? metrics.healthScore);
  const healthBand =
    healthScore >= 75 ? "Healthy" : healthScore >= 50 ? "Watch" : healthScore > 0 ? "Risk" : enriched.healthBand || "Watch";

  return {
    distributorId: enriched.id,
    name: enriched.name,
    territory: enriched.territorySummary || "—",
    lifecycleStatus: enriched.lifecycleStatus,
    lifecycleLabel: enriched.lifecycleLabel,
    canOperate: enriched.canOperate,
    contractExpired: enriched.contractExpired,
    contractExpiryLabel: enriched.contractExpiryLabel,
    labs: metrics.labs ?? enriched.labs ?? 0,
    activeLabs: metrics.activeLabs ?? 0,
    orders: metrics.orders ?? enriched.orders ?? 0,
    collections: metrics.collections ?? enriched.collections ?? 0,
    contracts: num(extras.contracts),
    agents: num(extras.agents ?? enriched.agents),
    commissionPayouts: num(extras.commissionPayouts),
    collectionEfficiencyPct: metrics.collectionEfficiencyPct ?? 0,
    revenue: metrics.revenue ?? 0,
    revenueLabel: formatInr(metrics.revenue ?? 0),
    outstanding: metrics.outstanding ?? enriched.outstanding ?? 0,
    outstandingLabel: formatInr(metrics.outstanding ?? enriched.outstanding ?? 0),
    healthScore,
    healthBand,
    revenueContributionPct: num(extras.revenueContributionPct),
    nextAction: suggestNextAction(enriched, metrics),
  };
}

function suggestNextAction(row, metrics = {}) {
  if (row.contractExpired) return "Renew contract";
  if (row.lifecycleStatus === LIFECYCLE_STATUS.DRAFT) return "Complete setup";
  if (row.lifecycleStatus === LIFECYCLE_STATUS.PENDING_LAUNCH) return "Launch distributor";
  if (row.lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED) return "Review suspension";
  if (row.lifecycleStatus === LIFECYCLE_STATUS.DEACTIVATED) return "Reactivate or archive";
  if ((metrics.labs ?? row.labs) === 0) return "Add first lab";
  if (row.healthBand === "Risk" || num(row.healthScore) < 50) return "Review collections risk";
  return "Monitor performance";
}

export function buildPortfolioDashboard(distributors = [], performanceRows = [], billingRows = []) {
  const total = distributors.length;
  const active = distributors.filter((d) => resolveDistributorLifecycleStatus(d) === LIFECYCLE_STATUS.ACTIVE).length;
  const suspended = distributors.filter(
    (d) => resolveDistributorLifecycleStatus(d) === LIFECYCLE_STATUS.SUSPENDED
  ).length;

  const monthlyRevenue = performanceRows.reduce((s, r) => s + num(r.revenue), 0);
  const collectionsFromDistributors = performanceRows.reduce((s, r) => s + num(r.collections), 0);
  const billingRollup = rollupPortfolioBilling(billingRows);

  const topByRevenue = [...performanceRows].sort((a, b) => num(b.revenue) - num(a.revenue))[0] || null;
  const atRisk = performanceRows.filter(
    (r) => r.healthBand === "Risk" || r.contractExpired || r.lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED
  );

  const expiring30 = distributors.filter((d) => {
    const days = contractExpiryState(d.config || {}).daysLeft;
    return days !== null && days >= 0 && days <= 30;
  }).length;
  const expiring60 = distributors.filter((d) => {
    const days = contractExpiryState(d.config || {}).daysLeft;
    return days !== null && days >= 0 && days <= 60;
  }).length;
  const expiring90 = distributors.filter((d) => {
    const days = contractExpiryState(d.config || {}).daysLeft;
    return days !== null && days >= 0 && days <= 90;
  }).length;

  return {
    totalDistributors: total,
    activeDistributors: active,
    suspendedDistributors: suspended,
    monthlyDistributorRevenue: monthlyRevenue,
    monthlyDistributorRevenueLabel: formatInr(monthlyRevenue),
    collectionsFromDistributors,
    topDistributorByRevenue: topByRevenue
      ? { name: topByRevenue.name, revenue: topByRevenue.revenue, revenueLabel: topByRevenue.revenueLabel }
      : null,
    atRiskDistributors: atRisk,
    atRiskCount: atRisk.length,
    contractsExpiring30: expiring30,
    contractsExpiring60: expiring60,
    contractsExpiring90: expiring90,
    billingRollup,
  };
}

export function buildComparisonTable(performanceRows = []) {
  return performanceRows.map((r) => ({
    distributorId: r.distributorId,
    distributor: r.name,
    territory: r.territory,
    labs: r.labs,
    revenue: r.revenue,
    revenueLabel: r.revenueLabel,
    collections: r.collections,
    outstanding: r.outstanding,
    outstandingLabel: r.outstandingLabel,
    health: r.healthScore,
    healthBand: r.healthBand,
    status: r.lifecycleLabel,
    lifecycleStatus: r.lifecycleStatus,
    nextAction: r.nextAction,
  }));
}

/**
 * Full portfolio model for Distributor OS dashboard + billing tabs.
 */
export function buildDistributorOsPortfolioModel({
  distributors = [],
  labs = [],
  orders = [],
  collections = [],
  contractCounts = {},
  agentCounts = {},
  homeTenantId = "",
} = {}) {
  const enriched = distributors.map((d) => enrichRegistryRowLifecycle(d));
  const totalRevenue = enriched.reduce((s, d) => {
    const m = computeDistributorMetrics(d.id, { labs, orders, collections });
    return s + m.revenue;
  }, 0);

  const performanceRows = enriched.map((d) => {
    const metrics = computeDistributorMetrics(d.id, { labs, orders, collections });
    const revenueContributionPct = totalRevenue > 0 ? Math.round((metrics.revenue / totalRevenue) * 100) : 0;
    return buildDistributorPerformanceRow(d, metrics, {
      contracts: contractCounts[d.id] ?? 0,
      agents: agentCounts[d.id] ?? d.agents ?? 0,
      revenueContributionPct,
    });
  });

  const billingRows = enriched.map((d) => {
    const metrics = computeDistributorMetrics(d.id, { labs, orders, collections });
    return buildDistributorBillingRow(d, metrics);
  });

  const dashboard = buildPortfolioDashboard(enriched, performanceRows, billingRows);
  const comparison = buildComparisonTable(performanceRows);

  const hqLeakCount = [...labs, ...orders, ...collections].filter(
    (r) => rowTenantId(r) === homeTenantId
  ).length;

  return {
    homeTenantId,
    distributors: enriched,
    performanceRows,
    billingRows,
    dashboard,
    comparison,
    hqLeakCount,
    totalRevenue,
  };
}
