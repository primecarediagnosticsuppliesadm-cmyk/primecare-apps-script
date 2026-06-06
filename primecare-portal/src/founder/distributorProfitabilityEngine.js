export const CONTRIBUTION_STATUS = {
  STRONG: "Strong",
  WATCH: "Watch",
  AT_RISK: "At Risk",
};

const AR_HIGH_THRESHOLD = 50_000;
const COLLECTIONS_RECOVERY_WEAK_PCT = 60;
const INVENTORY_RISK_RATIO = 0.15;

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function formatProfitabilityInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

export function contributionStatusFromScore(score) {
  const s = clamp(score);
  if (s >= 80) return CONTRIBUTION_STATUS.STRONG;
  if (s >= 60) return CONTRIBUTION_STATUS.WATCH;
  return CONTRIBUTION_STATUS.AT_RISK;
}

function inventoryDeadSlowRisk(inv = {}) {
  const total = num(inv.inventoryValue);
  if (total <= 0) return false;
  const risky = num(inv.deadInventoryValue) + num(inv.slowMovingInventoryValue);
  return risky / total >= INVENTORY_RISK_RATIO;
}

function contractRenewalRisk(renewal = {}) {
  return num(renewal.expiringContracts) > 0 || num(renewal.revenueAtRisk) > 0;
}

function collectionsRecoveryWeak(perf = {}, portfolioRecoveryPct = null) {
  const efficiency = num(perf.collectionEfficiencyPct);
  if (efficiency > 0 && efficiency < COLLECTIONS_RECOVERY_WEAK_PCT) return true;
  if (portfolioRecoveryPct != null && num(portfolioRecoveryPct) < COLLECTIONS_RECOVERY_WEAK_PCT) {
    return efficiency === 0;
  }
  return false;
}

function computeContributionScore(inputs = {}) {
  const {
    billingOutstanding = 0,
    billingCollected = 0,
    commissionLiability = 0,
    arOutstanding = 0,
    inventoryRisk = false,
    renewalRisk = false,
    collectionsWeak = false,
  } = inputs;

  let score = 100;
  const drivers = [];

  if (num(billingOutstanding) > num(billingCollected)) {
    score -= 20;
    drivers.push("Billing outstanding exceeds collected");
  }
  if (num(commissionLiability) > num(billingCollected)) {
    score -= 15;
    drivers.push("Commission liability exceeds billing collected");
  }
  if (num(arOutstanding) >= AR_HIGH_THRESHOLD) {
    score -= 15;
    drivers.push("High AR outstanding");
  }
  if (inventoryRisk) {
    score -= 10;
    drivers.push("Inventory dead/slow concentration");
  }
  if (renewalRisk) {
    score -= 10;
    drivers.push("Contract renewal risk");
  }
  if (collectionsWeak) {
    score -= 10;
    drivers.push("Weak collections recovery");
  }

  return {
    contributionScore: clamp(score),
    mainRiskDriver: drivers[0] || "No elevated risk drivers",
    riskDrivers: drivers,
  };
}

function buildProfitabilityRow({
  distributorId,
  name,
  perf = {},
  billing = {},
  comm = {},
  inv = {},
  renewal = {},
  contractRevenue = 0,
  collectionsRecoveryPct = null,
}) {
  const revenue = num(perf.revenue);
  const collections = num(perf.collectionsTotal);
  const arOutstanding = num(perf.outstanding);
  const billingDue = num(billing.amountDue);
  const billingCollected = num(billing.collected);
  const billingOutstanding = num(billing.outstanding);
  const commissionLiability = num(comm.liabilityTotal);
  const commissionPaid = num(comm.paidTotal);
  const inventoryValue = num(inv.inventoryValue);
  const reorderExposure = num(inv.reorderExposure);
  const revenueAtRisk = num(renewal.revenueAtRisk);
  const contributionSignal = billingCollected - commissionLiability;

  const scoreMeta = computeContributionScore({
    billingOutstanding,
    billingCollected,
    commissionLiability,
    arOutstanding,
    inventoryRisk: inventoryDeadSlowRisk(inv),
    renewalRisk: contractRenewalRisk(renewal),
    collectionsWeak: collectionsRecoveryWeak(perf, collectionsRecoveryPct),
  });

  const status = contributionStatusFromScore(scoreMeta.contributionScore);

  return {
    distributorId,
    name: name || distributorId,
    revenue,
    revenueLabel: perf.revenueLabel || formatProfitabilityInr(revenue),
    collections,
    collectionsLabel: perf.collectionsTotalLabel || formatProfitabilityInr(collections),
    arOutstanding,
    arOutstandingLabel: perf.outstandingLabel || formatProfitabilityInr(arOutstanding),
    billingDue,
    billingDueLabel: billing.amountDueLabel || formatProfitabilityInr(billingDue),
    billingCollected,
    billingCollectedLabel: billing.collectedLabel || formatProfitabilityInr(billingCollected),
    billingOutstanding,
    billingOutstandingLabel: billing.outstandingLabel || formatProfitabilityInr(billingOutstanding),
    commissionLiability,
    commissionLiabilityLabel: formatProfitabilityInr(commissionLiability),
    commissionPaid,
    commissionPaidLabel: formatProfitabilityInr(commissionPaid),
    inventoryValue,
    inventoryValueLabel: inv.inventoryValueLabel || formatProfitabilityInr(inventoryValue),
    reorderExposure,
    reorderExposureLabel: inv.reorderExposureLabel || formatProfitabilityInr(reorderExposure),
    contractRevenue: num(contractRevenue),
    contractRevenueLabel: formatProfitabilityInr(contractRevenue),
    revenueAtRisk,
    revenueAtRiskLabel: renewal.revenueAtRiskLabel || formatProfitabilityInr(revenueAtRisk),
    contributionSignal,
    contributionSignalLabel: formatProfitabilityInr(contributionSignal),
    contributionSignalNote: "Operational contribution signal (billing collected − commission liability)",
    contributionScore: scoreMeta.contributionScore,
    contributionScoreLabel: `${scoreMeta.contributionScore}`,
    status,
    statusLabel: status,
    mainRiskDriver: scoreMeta.mainRiskDriver,
    riskDrivers: scoreMeta.riskDrivers,
  };
}

/**
 * Build distributor profitability rows from existing portfolio / FI models.
 */
export function buildDistributorProfitabilityModel({
  distributors = [],
  performanceRows = [],
  billingRows = [],
  commissionByDistributor = {},
  contractRenewal = null,
  inventoryEconomics = null,
  contractRevenueByDistributor = new Map(),
  collectionsRecoveryPct = null,
} = {}) {
  const perfById = new Map(performanceRows.map((r) => [r.distributorId, r]));
  const billingById = new Map(billingRows.map((r) => [r.distributorId, r]));
  const inventoryById = new Map(
    (inventoryEconomics?.inventoryValueByDistributor || []).map((r) => [r.distributorId, r])
  );
  const renewalById = new Map(
    (contractRenewal?.distributorRenewalHealth || []).map((r) => [r.distributorId, r])
  );

  const rows = distributors.map((d) => {
    const id = d.id;
    return buildProfitabilityRow({
      distributorId: id,
      name: d.name || id,
      perf: perfById.get(id) || {},
      billing: billingById.get(id) || {},
      comm: commissionByDistributor[id] || {},
      inv: inventoryById.get(id) || {},
      renewal: renewalById.get(id) || {},
      contractRevenue: contractRevenueByDistributor.get(id) || 0,
      collectionsRecoveryPct,
    });
  });

  const totals = {
    revenue: rows.reduce((s, r) => s + num(r.revenue), 0),
    collections: rows.reduce((s, r) => s + num(r.collections), 0),
    arOutstanding: rows.reduce((s, r) => s + num(r.arOutstanding), 0),
    billingCollected: rows.reduce((s, r) => s + num(r.billingCollected), 0),
    billingOutstanding: rows.reduce((s, r) => s + num(r.billingOutstanding), 0),
    commissionLiability: rows.reduce((s, r) => s + num(r.commissionLiability), 0),
    contributionSignal: rows.reduce((s, r) => s + num(r.contributionSignal), 0),
    revenueAtRisk: rows.reduce((s, r) => s + num(r.revenueAtRisk), 0),
  };

  return {
    rows,
    totals: {
      ...totals,
      revenueLabel: formatProfitabilityInr(totals.revenue),
      billingCollectedLabel: formatProfitabilityInr(totals.billingCollected),
      contributionSignalLabel: formatProfitabilityInr(totals.contributionSignal),
    },
    atRiskCount: rows.filter((r) => r.status === CONTRIBUTION_STATUS.AT_RISK).length,
    watchCount: rows.filter((r) => r.status === CONTRIBUTION_STATUS.WATCH).length,
    strongCount: rows.filter((r) => r.status === CONTRIBUTION_STATUS.STRONG).length,
    negativeContributionCount: rows.filter((r) => num(r.contributionSignal) < 0).length,
    distributorCount: rows.length,
  };
}

export function findProfitabilityRow(model, distributorId) {
  return (model?.rows || []).find((r) => r.distributorId === str(distributorId)) || null;
}
