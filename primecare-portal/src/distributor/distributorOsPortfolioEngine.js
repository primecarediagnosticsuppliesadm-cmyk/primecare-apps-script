/**
 * Distributor OS V2 portfolio — dashboard, performance, comparison.
 */

import { buildDistributorBillingRow, rollupPortfolioBilling } from "@/distributor/distributorBillingEngine.js";
import {
  computeDistributorHealthScore,
  healthBandFromScore,
} from "@/distributor/distributorHealthEngine.js";
import {
  canDistributorOperate,
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

const SETUP_LIFECYCLE_STATUSES = new Set([
  LIFECYCLE_STATUS.DRAFT,
  LIFECYCLE_STATUS.PENDING_LAUNCH,
]);

/** Active lifecycle with a non-expired contract — eligible for top distributor and revenue rollups. */
export function isTopDistributorEligible(row = {}) {
  const lifecycleStatus = str(row.lifecycleStatus || resolveDistributorLifecycleStatus(row));
  if (lifecycleStatus !== LIFECYCLE_STATUS.ACTIVE) return false;
  if (row.contractExpired === true) return false;
  return canDistributorOperate(lifecycleStatus, row.config || {});
}

export function isSetupRiskDistributor(row = {}) {
  const lifecycleStatus = str(row.lifecycleStatus || resolveDistributorLifecycleStatus(row));
  return SETUP_LIFECYCLE_STATUSES.has(lifecycleStatus);
}

export function isOperationalRiskDistributor(row = {}) {
  const lifecycleStatus = str(row.lifecycleStatus || resolveDistributorLifecycleStatus(row));
  return (
    lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED ||
    row.contractExpired === true ||
    row.healthBand === "At Risk"
  );
}

export function classifyDistributorRisk(row = {}) {
  if (isSetupRiskDistributor(row)) return "setup";
  if (isOperationalRiskDistributor(row)) return "operational";
  return null;
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
  const expiry = contractExpiryState(enriched.config || {});
  const launchComplete = enriched.lifecycleStatus === LIFECYCLE_STATUS.ACTIVE;
  const healthScore = computeDistributorHealthScore({
    activeLabs: metrics.activeLabs ?? 0,
    labCount: metrics.labs ?? enriched.labs ?? 0,
    collectionEfficiencyPct: metrics.collectionEfficiencyPct ?? 0,
    outstanding: metrics.outstanding ?? enriched.outstanding ?? 0,
    revenue: metrics.revenue ?? 0,
    contractExpired: enriched.contractExpired,
    contractDaysLeft: expiry.daysLeft,
    launchComplete,
    agentCount: num(extras.agents ?? enriched.agents),
    lifecycleStatus: enriched.lifecycleStatus,
  });
  const health = healthBandFromScore(healthScore);

  return {
    distributorId: enriched.id,
    name: enriched.name,
    territory: enriched.territorySummary || "—",
    lifecycleStatus: enriched.lifecycleStatus,
    lifecycleLabel: enriched.lifecycleLabel,
    canOperate: enriched.canOperate,
    contractExpired: enriched.contractExpired,
    contractExpiryLabel: enriched.contractExpired
      ? "Expired"
      : expiry.daysLeft !== null
        ? `${expiry.daysLeft} days`
        : "Not configured",
    labs: metrics.labs ?? enriched.labs ?? 0,
    activeLabs: metrics.activeLabs ?? 0,
    orders: metrics.orders ?? enriched.orders ?? 0,
    collections: metrics.collections ?? enriched.collections ?? 0,
    collectionsTotal: metrics.collectionsTotal ?? 0,
    collectionsTotalLabel: formatInr(metrics.collectionsTotal ?? 0),
    contracts: num(extras.contracts),
    agents: num(extras.agents ?? enriched.agents),
    commissionPayouts: num(extras.commissionPayouts),
    collectionEfficiencyPct: metrics.collectionEfficiencyPct ?? 0,
    revenue: metrics.revenue ?? 0,
    revenueLabel: formatInr(metrics.revenue ?? 0),
    outstanding: metrics.outstanding ?? enriched.outstanding ?? 0,
    outstandingLabel: formatInr(metrics.outstanding ?? enriched.outstanding ?? 0),
    healthScore,
    healthBand: health.band,
    healthColor: health.color,
    healthVariant: health.variant,
    revenueContributionPct: num(extras.revenueContributionPct),
    nextAction: suggestNextAction(enriched, metrics, health.band),
  };
}

function suggestNextAction(row, metrics = {}, healthBand = "Watch") {
  if (row.lifecycleStatus === LIFECYCLE_STATUS.DRAFT) return "Complete setup";
  if (row.lifecycleStatus === LIFECYCLE_STATUS.PENDING_LAUNCH) return "Launch distributor";
  if (row.lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED) return "Resolve suspension";
  if (row.lifecycleStatus === LIFECYCLE_STATUS.DEACTIVATED) return "Historical only";
  if (row.contractExpired) return "Renew contract";
  if (!row.contractExpiryLabel || row.contractExpiryLabel === "Not configured") {
    return "Configure contract";
  }
  if (row.lifecycleStatus === LIFECYCLE_STATUS.ACTIVE) {
    if ((metrics.labs ?? row.labs) === 0) return "Add first lab";
    if (healthBand === "At Risk") return "Review collections risk";
    return "Monitor performance";
  }
  return "Review status";
}

export function buildPortfolioDashboard(distributors = [], performanceRows = [], billingRows = []) {
  const total = distributors.length;
  const active = distributors.filter((d) => resolveDistributorLifecycleStatus(d) === LIFECYCLE_STATUS.ACTIVE).length;
  const suspended = distributors.filter(
    (d) => resolveDistributorLifecycleStatus(d) === LIFECYCLE_STATUS.SUSPENDED
  ).length;

  const rankingRows = performanceRows.filter((r) => isTopDistributorEligible(r));
  const monthlyRevenue = rankingRows.reduce((s, r) => s + num(r.revenue), 0);
  const collectionsFromDistributors = rankingRows.reduce((s, r) => s + num(r.collectionsTotal), 0);
  const collectionsFromDistributorsLabel = formatInr(collectionsFromDistributors);
  const billingRollup = rollupPortfolioBilling(
    billingRows.filter((b) => {
      const perf = performanceRows.find((r) => r.distributorId === b.distributorId);
      return perf && isTopDistributorEligible(perf);
    })
  );

  const topByRevenue =
    [...rankingRows].sort((a, b) => num(b.revenue) - num(a.revenue))[0] || null;

  const needsAttention =
    [...performanceRows]
      .filter((r) => isSetupRiskDistributor(r) || isOperationalRiskDistributor(r))
      .sort((a, b) => num(a.healthScore) - num(b.healthScore))[0] || null;

  const setupRisk = performanceRows.filter((r) => isSetupRiskDistributor(r));
  const operationalRisk = performanceRows.filter((r) => isOperationalRiskDistributor(r));

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
    collectionsFromDistributorsLabel,
    needsAttentionDistributor: needsAttention
      ? {
          distributorId: needsAttention.distributorId,
          name: needsAttention.name,
          healthScore: needsAttention.healthScore,
          healthBand: needsAttention.healthBand,
          nextAction: needsAttention.nextAction,
        }
      : null,
    topDistributorByRevenue: topByRevenue
      ? {
          distributorId: topByRevenue.distributorId,
          name: topByRevenue.name,
          revenue: topByRevenue.revenue,
          revenueLabel: topByRevenue.revenueLabel,
          lifecycleStatus: topByRevenue.lifecycleStatus,
          rankingEligible: true,
          isPlaceholder: false,
        }
      : {
          distributorId: null,
          name: "No active distributor yet",
          revenue: 0,
          revenueLabel: null,
          lifecycleStatus: null,
          rankingEligible: false,
          isPlaceholder: true,
        },
    setupRiskDistributors: setupRisk,
    setupRiskCount: setupRisk.length,
    operationalRiskDistributors: operationalRisk,
    operationalRiskCount: operationalRisk.length,
    atRiskDistributors: [
      ...setupRisk.map((r) => ({ ...r, riskType: "setup" })),
      ...operationalRisk.map((r) => ({ ...r, riskType: "operational" })),
    ],
    atRiskCount: operationalRisk.length,
    rankingEligibleCount: rankingRows.length,
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
    status: r.lifecycleLabel,
    lifecycleStatus: r.lifecycleStatus,
    labs: r.labs,
    revenue: r.revenue,
    revenueLabel: r.revenueLabel,
    collections: r.collectionsTotal,
    collectionsLabel: r.collectionsTotalLabel,
    outstanding: r.outstanding,
    outstandingLabel: r.outstandingLabel,
    collectionEfficiencyPct: r.collectionEfficiencyPct,
    contractExpiryLabel: r.contractExpiryLabel,
    health: r.healthScore,
    healthBand: r.healthBand,
    healthColor: r.healthColor,
    healthVariant: r.healthVariant,
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

  const performanceRows = enriched.map((d) => {
    const metrics = computeDistributorMetrics(d.id, { labs, orders, collections });
    return buildDistributorPerformanceRow(d, metrics, {
      contracts: contractCounts[d.id] ?? 0,
      agents: agentCounts[d.id] ?? d.agents ?? 0,
      revenueContributionPct: 0,
    });
  });

  const rankingRows = performanceRows.filter((r) => isTopDistributorEligible(r));
  const totalRevenue = rankingRows.reduce((s, r) => s + num(r.revenue), 0);
  const totalRevenueAll = performanceRows.reduce((s, r) => s + num(r.revenue), 0);

  for (const row of performanceRows) {
    row.rankingEligible = isTopDistributorEligible(row);
    row.revenueContributionPct =
      row.rankingEligible && totalRevenue > 0
        ? Math.round((num(row.revenue) / totalRevenue) * 100)
        : 0;
  }

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
    totalRevenueAll,
    rankingEligibleCount: rankingRows.length,
  };
}
