import { ACTION_QUEUE_SEVERITY } from "@/operations/executiveActionQueueTypes.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Normalize INR revenue signal to 0–100.
 * @param {number} amountInr
 * @param {number} capInr
 */
export function normalizeRevenueImpact(amountInr, capInr = 100_000) {
  const cap = Math.max(1, num(capInr));
  return clamp((num(amountInr) / cap) * 100);
}

export function severityComponent(severity) {
  switch (String(severity || "").toUpperCase()) {
    case ACTION_QUEUE_SEVERITY.CRITICAL:
      return 100;
    case ACTION_QUEUE_SEVERITY.ATTENTION:
      return 65;
    default:
      return 30;
  }
}

export function ageComponent(ageDays = 0) {
  return clamp(num(ageDays) * 4, 0, 100);
}

/**
 * Executive Impact Score — primary queue sort key (default modules).
 * Weights: revenue 45%, urgency 25%, age 20%, severity 10%.
 */
export function computeExecutiveImpactScore({
  revenueImpact = 0,
  urgencyScore = 0,
  ageDays = 0,
  severity = ACTION_QUEUE_SEVERITY.MONITORING,
}) {
  const revenue = clamp(num(revenueImpact));
  const urgency = clamp(num(urgencyScore));
  const age = ageComponent(ageDays);
  const sev = severityComponent(severity);

  return clamp(revenue * 0.45 + urgency * 0.25 + age * 0.2 + sev * 0.1);
}

/**
 * Ownership module impact score (Phase 3C).
 * Weights: revenue 40%, urgency 25%, age 20%, ownership risk 15%.
 */
export function computeOwnershipImpactScore({
  revenueImpact = 0,
  urgencyScore = 0,
  ageDays = 0,
  ownershipRisk = 0,
  severity = ACTION_QUEUE_SEVERITY.MONITORING,
}) {
  const revenue = clamp(num(revenueImpact));
  const urgency = clamp(num(urgencyScore));
  const age = ageComponent(ageDays);
  const risk = clamp(num(ownershipRisk));
  const sev = severityComponent(severity) * 0.15;

  return clamp(revenue * 0.4 + urgency * 0.25 + age * 0.2 + risk * 0.15 + sev);
}

export function renewalRiskToSeverity(riskLevel) {
  const r = String(riskLevel || "").toLowerCase();
  if (r === "critical") return ACTION_QUEUE_SEVERITY.CRITICAL;
  if (r === "high") return ACTION_QUEUE_SEVERITY.ATTENTION;
  return ACTION_QUEUE_SEVERITY.MONITORING;
}

export function qualificationBandToSeverity(band) {
  const b = String(band || "").toLowerCase();
  if (b === "hot") return ACTION_QUEUE_SEVERITY.ATTENTION;
  if (b === "warm") return ACTION_QUEUE_SEVERITY.MONITORING;
  return ACTION_QUEUE_SEVERITY.MONITORING;
}

export function commissionAmountToSeverity(amountInr) {
  return num(amountInr) >= 10_000 ? ACTION_QUEUE_SEVERITY.ATTENTION : ACTION_QUEUE_SEVERITY.MONITORING;
}
