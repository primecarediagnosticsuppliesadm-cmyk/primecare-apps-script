/**
 * Distributor health score — founder-operated Year-1 model.
 * Inputs: labs, collections, contract, launch progress, agents.
 */

import { LIFECYCLE_STATUS } from "@/distributor/distributorLifecycleEngine.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {object} params
 * @returns {number} 0–100
 */
export function computeDistributorHealthScore({
  activeLabs = 0,
  labCount = 0,
  collectionEfficiencyPct = 0,
  outstanding = 0,
  revenue = 0,
  contractExpired = false,
  contractDaysLeft = null,
  launchComplete = false,
  agentCount = 0,
  lifecycleStatus = LIFECYCLE_STATUS.DRAFT,
} = {}) {
  const lifecycle = str(lifecycleStatus).toLowerCase();

  if (lifecycle === LIFECYCLE_STATUS.DRAFT || lifecycle === LIFECYCLE_STATUS.PENDING_LAUNCH) {
    let score = launchComplete ? 55 : 45;
    if (labCount > 0) score += 5;
    if (agentCount > 0) score += 5;
    return clamp(score);
  }

  if (lifecycle === LIFECYCLE_STATUS.SUSPENDED || lifecycle === LIFECYCLE_STATUS.DEACTIVATED) {
    return clamp(25);
  }

  let score = 50;
  const labs = activeLabs > 0 ? activeLabs : labCount;

  if (labs >= 5) score += 20;
  else if (labs >= 1) score += 12;
  else score -= 12;

  score += Math.min(25, (num(collectionEfficiencyPct) / 100) * 25);

  if (revenue > 0) {
    const ratio = num(outstanding) / num(revenue);
    if (ratio > 0.5) score -= 20;
    else if (ratio > 0.25) score -= 10;
    else if (ratio < 0.1) score += 5;
  } else if (outstanding > 0) {
    score -= 15;
  }

  if (contractExpired) score -= 25;
  else if (contractDaysLeft !== null) {
    if (contractDaysLeft > 90) score += 10;
    else if (contractDaysLeft > 30) score += 5;
    else if (contractDaysLeft >= 0) score -= 10;
  }

  if (agentCount >= 1) score += 5;
  if (launchComplete) score += 5;

  return clamp(score);
}

export function healthBandFromScore(score) {
  const s = num(score);
  if (s >= 80) return { band: "Healthy", color: "Green", variant: "success" };
  if (s >= 60) return { band: "Watch", color: "Yellow", variant: "warning" };
  return { band: "At Risk", color: "Red", variant: "danger" };
}

export const HEALTH_BAND_VARIANT = {
  Healthy: "success",
  Watch: "warning",
  "At Risk": "danger",
};
