/**
 * Distributor billing V2 — what each distributor owes PrimeCare HQ.
 */

import {
  contractExpiryState,
  defaultBillingDueDate,
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

/**
 * @param {object} params
 * @param {object} params.config - distributor config
 * @param {number} [params.collectionsTotal] - distributor collections volume
 * @param {number} [params.activeLabs] - active lab count
 */
export function calculateDistributorBilling({
  config = {},
  collectionsTotal = 0,
  activeLabs = 0,
  labCount = 0,
} = {}) {
  const model = str(config.billingModel || "fixed_monthly");
  const monthlyFee = num(config.monthlyPlatformFee);
  const sharePct = num(config.revenueSharePct);
  const perLabFee = num(config.perLabFee);
  const labsForFee = activeLabs > 0 ? activeLabs : labCount;

  let fixedComponent = 0;
  let shareComponent = 0;
  let perLabComponent = 0;

  if (model === "fixed_monthly") {
    fixedComponent = monthlyFee;
  } else if (model === "revenue_share") {
    shareComponent = (collectionsTotal * sharePct) / 100;
  } else if (model === "per_lab") {
    perLabComponent = labsForFee * perLabFee;
  } else if (model === "hybrid") {
    fixedComponent = monthlyFee;
    shareComponent = (collectionsTotal * sharePct) / 100;
    perLabComponent = labsForFee * perLabFee;
  }

  const amountDue = fixedComponent + shareComponent + perLabComponent;
  const collected = num(config.billingCollected);
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

  return {
    billingModel: model,
    billingModelLabel: billingModelLabel(model),
    fixedComponent,
    shareComponent,
    perLabComponent,
    amountDue,
    amountDueLabel: formatInr(amountDue),
    collected,
    collectedLabel: formatInr(collected),
    outstanding,
    outstandingLabel: formatInr(outstanding),
    dueDate,
    overdue,
    paymentStatus,
    breakdown: {
      fixed: fixedComponent,
      revenueShare: shareComponent,
      perLab: perLabComponent,
    },
  };
}

export function buildDistributorBillingRow(distributorRow, metrics = {}) {
  const config = distributorRow.config || {};
  const billing = calculateDistributorBilling({
    config,
    collectionsTotal: num(metrics.collectionsTotal ?? distributorRow.collections),
    activeLabs: num(metrics.activeLabs),
    labCount: num(metrics.labs ?? distributorRow.labs),
  });
  const lifecycleStatus = resolveDistributorLifecycleStatus(distributorRow);
  const expiry = contractExpiryState(config);

  return {
    distributorId: distributorRow.id,
    distributorName: distributorRow.name,
    territory: distributorRow.territorySummary || "—",
    lifecycleStatus,
    ...billing,
    contractExpiryLabel: expiry.label,
    contractExpired: expiry.expired,
  };
}

export function rollupPortfolioBilling(billingRows = []) {
  const totalDue = billingRows.reduce((s, r) => s + num(r.amountDue), 0);
  const totalCollected = billingRows.reduce((s, r) => s + num(r.collected), 0);
  const totalOutstanding = billingRows.reduce((s, r) => s + num(r.outstanding), 0);
  const overdueCount = billingRows.filter((r) => r.overdue).length;

  return {
    totalDue,
    totalDueLabel: formatInr(totalDue),
    totalCollected,
    totalCollectedLabel: formatInr(totalCollected),
    totalOutstanding,
    totalOutstandingLabel: formatInr(totalOutstanding),
    overdueCount,
    distributorCount: billingRows.length,
  };
}
