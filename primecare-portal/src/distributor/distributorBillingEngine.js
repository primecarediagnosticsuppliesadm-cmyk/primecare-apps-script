/**
 * Distributor billing V2 — what each distributor owes PrimeCare HQ.
 */

import {
  contractExpiryState,
  defaultBillingDueDate,
  LIFECYCLE_STATUS,
  resolveDistributorLifecycleStatus,
} from "@/distributor/distributorLifecycleEngine.js";

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

export const BILLING_MODEL_LABELS = {
  fixed_monthly: "Fixed monthly",
  revenue_share: "Revenue share",
  per_lab: "Per lab",
  hybrid: "Hybrid",
};

export function billingModelLabel(model) {
  return BILLING_MODEL_LABELS[model] || model || "—";
}

export const BILLING_COLLECTED_SOURCES = {
  LEDGER: "ledger",
  CONFIG_FALLBACK: "config_fallback",
  CONFIG_FALLBACK_ERROR: "config_fallback_error",
};

export const BILLING_MODELS = {
  FIXED_MONTHLY: "fixed_monthly",
  REVENUE_SHARE: "revenue_share",
  PER_LAB: "per_lab",
  HYBRID: "hybrid",
};

/**
 * Authoritative billing component math from distributor config + activity.
 * @param {string} model
 * @param {object} config
 * @param {{ collectedRevenue?: number, activeLabs?: number, labCount?: number }} activity
 */
export function computeBillingComponents(model, config = {}, activity = {}) {
  const billingModel = str(model || config.billingModel || BILLING_MODELS.FIXED_MONTHLY);
  const monthlyFee = num(config.monthlyPlatformFee);
  const revenueSharePercent = num(config.revenueSharePct);
  const perLabFee = num(config.perLabFee);
  const collectedRevenue = num(
    activity.collectedRevenue ?? activity.collectionsTotal ?? 0
  );
  const activeLabCount = num(activity.activeLabs);
  const labCount = num(activity.labCount);
  const labsForFee = activeLabCount > 0 ? activeLabCount : labCount;

  let fixedComponent = 0;
  let shareComponent = 0;
  let perLabComponent = 0;

  if (billingModel === BILLING_MODELS.FIXED_MONTHLY) {
    fixedComponent = monthlyFee;
  } else if (billingModel === BILLING_MODELS.REVENUE_SHARE) {
    shareComponent = (collectedRevenue * revenueSharePercent) / 100;
  } else if (billingModel === BILLING_MODELS.PER_LAB) {
    perLabComponent = labsForFee * perLabFee;
  } else if (billingModel === BILLING_MODELS.HYBRID) {
    fixedComponent = monthlyFee;
    shareComponent = (collectedRevenue * revenueSharePercent) / 100;
    perLabComponent = labsForFee * perLabFee;
  }

  const amountDue = fixedComponent + shareComponent + perLabComponent;

  return {
    billingModel,
    monthlyFee,
    revenueSharePercent,
    perLabFee,
    collectedRevenue,
    activeLabCount: labsForFee,
    fixedComponent,
    shareComponent,
    perLabComponent,
    amountDue,
  };
}

/** @returns {string[]} */
export function billingConfigWarnings(model, config = {}) {
  const billingModel = str(model || config.billingModel || BILLING_MODELS.FIXED_MONTHLY);
  const warnings = [];
  if (billingModel === BILLING_MODELS.FIXED_MONTHLY && num(config.monthlyPlatformFee) <= 0) {
    warnings.push("monthlyPlatformFee missing");
  }
  if (billingModel === BILLING_MODELS.REVENUE_SHARE && num(config.revenueSharePct) <= 0) {
    warnings.push("revenueSharePct missing");
  }
  if (billingModel === BILLING_MODELS.PER_LAB && num(config.perLabFee) <= 0) {
    warnings.push("perLabFee missing");
  }
  if (billingModel === BILLING_MODELS.HYBRID) {
    if (num(config.monthlyPlatformFee) <= 0) warnings.push("monthlyPlatformFee missing");
    if (num(config.revenueSharePct) <= 0) warnings.push("revenueSharePct missing");
    if (num(config.perLabFee) <= 0) warnings.push("perLabFee missing");
  }
  return warnings;
}

export function amountDueMatchesBreakdown(row = {}) {
  const sum =
    num(row.fixedComponent ?? row.breakdown?.fixed) +
    num(row.shareComponent ?? row.breakdown?.revenueShare) +
    num(row.perLabComponent ?? row.breakdown?.perLab);
  return Math.abs(sum - num(row.amountDue)) <= 0.01;
}

/**
 * Resolve collected amount — ledger sum when rows exist; config fallback otherwise.
 * @param {object} params
 * @param {object} params.config
 * @param {number} [params.ledgerSum]
 * @param {number} [params.ledgerCount]
 * @param {boolean} [params.ledgerOk]
 * @param {string|null} [params.lastPaymentDateFromLedger]
 */
export function resolveBillingCollected({
  config = {},
  ledgerSum = 0,
  ledgerCount = 0,
  ledgerOk = true,
  lastPaymentDateFromLedger = null,
} = {}) {
  const configCollected = num(config.billingCollected);
  const configLastPayment = str(config.billingLastPaymentDate || config.lastPaymentDate) || null;

  if (ledgerOk && ledgerCount > 0) {
    return {
      collected: num(ledgerSum),
      collectedSource: BILLING_COLLECTED_SOURCES.LEDGER,
      lastPaymentDate: str(lastPaymentDateFromLedger) || configLastPayment || null,
      billingLedgerCount: ledgerCount,
    };
  }

  if (ledgerOk) {
    return {
      collected: configCollected,
      collectedSource: BILLING_COLLECTED_SOURCES.CONFIG_FALLBACK,
      lastPaymentDate: configLastPayment,
      billingLedgerCount: 0,
    };
  }

  return {
    collected: configCollected,
    collectedSource: BILLING_COLLECTED_SOURCES.CONFIG_FALLBACK_ERROR,
    lastPaymentDate: configLastPayment,
    billingLedgerCount: 0,
  };
}

/**
 * @param {object} params
 * @param {object} params.config - distributor config
 * @param {number} [params.collectionsTotal] - distributor collections volume
 * @param {number} [params.activeLabs] - active lab count
 * @param {number} [params.collected] - resolved collected (ledger or fallback)
 * @param {string|null} [params.lastPaymentDate]
 * @param {string} [params.collectedSource]
 */
export function calculateDistributorBilling({
  config = {},
  collectionsTotal = 0,
  collectedRevenue = null,
  activeLabs = 0,
  labCount = 0,
  collected: collectedOverride = null,
  lastPaymentDate: lastPaymentDateOverride = null,
  collectedSource = null,
} = {}) {
  const resolvedCollectedRevenue =
    collectedRevenue != null ? num(collectedRevenue) : num(collectionsTotal);

  const components = computeBillingComponents(config.billingModel, config, {
    collectedRevenue: resolvedCollectedRevenue,
    activeLabs,
    labCount,
  });

  const {
    billingModel: model,
    monthlyFee,
    revenueSharePercent: sharePct,
    perLabFee,
    activeLabCount: labsForFee,
    fixedComponent,
    shareComponent,
    perLabComponent,
    amountDue,
    collectedRevenue: activityCollectedRevenue,
  } = components;

  const collected =
    collectedOverride != null ? num(collectedOverride) : num(config.billingCollected);
  const outstanding = Math.max(0, amountDue - collected);
  const dueDate = str(config.billingDueDate) || defaultBillingDueDate(config);
  const dueDays = dueDate
    ? Math.ceil((Date.parse(dueDate) - Date.now()) / 86400000)
    : null;
  const overdue = outstanding > 0 && dueDays !== null && dueDays < 0;

  let paymentStatus = "current";
  if (outstanding <= 0 && amountDue > 0) paymentStatus = "paid";
  else if (overdue) paymentStatus = "overdue";
  else if (outstanding > 0) paymentStatus = "due";

  const calculationSource = [
    `model:${model}`,
    `activity:collected_revenue=${activityCollectedRevenue},active_labs=${labsForFee}`,
    collectedSource ? `platform_collected:${collectedSource}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    billingModel: model,
    billingModelLabel: billingModelLabel(model),
    monthlyFee: monthlyFee,
    monthlyFeeLabel: formatInr(monthlyFee),
    revenueSharePct: sharePct,
    perLabFee,
    perLabFeeLabel: formatInr(perLabFee),
    activeLabCount: labsForFee,
    collectedRevenue: activityCollectedRevenue,
    collectedRevenueLabel: formatInr(activityCollectedRevenue),
    fixedComponent,
    fixedComponentLabel: formatInr(fixedComponent),
    shareComponent,
    shareComponentLabel: formatInr(shareComponent),
    perLabComponent,
    perLabComponentLabel: formatInr(perLabComponent),
    amountDue,
    amountDueLabel: formatInr(amountDue),
    collected,
    collectedLabel: formatInr(collected),
    outstanding,
    outstandingLabel: formatInr(outstanding),
    dueDate,
    lastPaymentDate:
      lastPaymentDateOverride != null
        ? str(lastPaymentDateOverride) || null
        : str(config.billingLastPaymentDate || config.lastPaymentDate) || null,
    collectedSource: collectedSource || null,
    calculationSource,
    configWarnings: billingConfigWarnings(model, config),
    overdue,
    paymentStatus,
    breakdown: {
      fixed: fixedComponent,
      revenueShare: shareComponent,
      perLab: perLabComponent,
    },
  };
}

export function resolveBillingHealthStatus(billing = {}, lifecycleStatus = "") {
  const lifecycle = str(lifecycleStatus).toLowerCase();
  if (
    lifecycle === LIFECYCLE_STATUS.SUSPENDED ||
    lifecycle === LIFECYCLE_STATUS.DEACTIVATED
  ) {
    return { label: "Blocked", variant: "danger" };
  }
  if (billing.overdue || billing.paymentStatus === "overdue") {
    return { label: "Overdue", variant: "danger" };
  }
  return { label: "Healthy", variant: "success" };
}

export function buildDistributorBillingRow(distributorRow, metrics = {}) {
  const config = distributorRow.config || {};
  const resolved = resolveBillingCollected({
    config,
    ledgerSum: num(metrics.billingLedgerSum),
    ledgerCount: num(metrics.billingLedgerCount),
    ledgerOk: metrics.billingLedgerOk !== false,
    lastPaymentDateFromLedger: metrics.billingLastPaymentDate || null,
  });
  const billing = calculateDistributorBilling({
    config,
    collectionsTotal: num(metrics.collectionsTotal ?? distributorRow.collections),
    collectedRevenue: num(metrics.collectedRevenue),
    activeLabs: num(metrics.activeLabs),
    labCount: num(metrics.labs ?? distributorRow.labs),
    collected: resolved.collected,
    lastPaymentDate: resolved.lastPaymentDate,
    collectedSource: resolved.collectedSource,
  });
  const lifecycleStatus = resolveDistributorLifecycleStatus(distributorRow);
  const expiry = contractExpiryState(config);
  const billingStatus = resolveBillingHealthStatus(billing, lifecycleStatus);

  return {
    distributorId: distributorRow.id,
    distributorName: distributorRow.name,
    territory: distributorRow.territorySummary || "—",
    lifecycleStatus,
    ...billing,
    billingLedgerCount: resolved.billingLedgerCount,
    billingStatusLabel: billingStatus.label,
    billingStatusVariant: billingStatus.variant,
    contractExpiryLabel: expiry.label,
    contractExpired: expiry.expired,
  };
}

export function rollupPortfolioBilling(billingRows = []) {
  const totalDue = billingRows.reduce((s, r) => s + num(r.amountDue), 0);
  const totalCollected = billingRows.reduce((s, r) => s + num(r.collected), 0);
  const totalOutstanding = billingRows.reduce((s, r) => s + num(r.outstanding), 0);
  const fixedMonthlyDue = billingRows.reduce(
    (s, r) => s + num(r.fixedComponent ?? r.breakdown?.fixed),
    0
  );
  const revenueShareDue = billingRows.reduce(
    (s, r) => s + num(r.shareComponent ?? r.breakdown?.revenueShare),
    0
  );
  const perLabDue = billingRows.reduce(
    (s, r) => s + num(r.perLabComponent ?? r.breakdown?.perLab),
    0
  );
  const overdueCount = billingRows.filter((r) => r.overdue).length;
  const collectionRatePct =
    totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : null;

  return {
    totalDue,
    totalDueLabel: formatInr(totalDue),
    totalCollected,
    totalCollectedLabel: formatInr(totalCollected),
    totalOutstanding,
    totalOutstandingLabel: formatInr(totalOutstanding),
    fixedMonthlyDue,
    fixedMonthlyDueLabel: formatInr(fixedMonthlyDue),
    revenueShareDue,
    revenueShareDueLabel: formatInr(revenueShareDue),
    perLabDue,
    perLabDueLabel: formatInr(perLabDue),
    collectionRatePct,
    overdueCount,
    distributorCount: billingRows.length,
  };
}
