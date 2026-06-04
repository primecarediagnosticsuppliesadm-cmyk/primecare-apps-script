/**
 * Phase-based compensation rules (config only — no schema).
 * Aligns with founder journey phases.
 */

export const COMMISSION_RULE_VERSION = "v1";

/** @typedef {Object} CommissionPhaseRule
 * @property {number} collectionRate — % of attributed collections (0–1)
 * @property {number} revenueShare — % of attributed fulfilled revenue (0–1)
 * @property {number} minMonthlyCollection — INR minimum collected to earn commission
 * @property {number} minEfficiencyPct — minimum collection efficiency (0–100)
 * @property {string} label
 */

/** @type {Record<string, CommissionPhaseRule>} */
export const COMMISSION_PHASE_RULES = {
  foundation: {
    label: "Foundation",
    collectionRate: 0.06,
    revenueShare: 0.015,
    minMonthlyCollection: 15_000,
    minEfficiencyPct: 45,
  },
  operational_core: {
    label: "Operational Core",
    collectionRate: 0.07,
    revenueShare: 0.018,
    minMonthlyCollection: 20_000,
    minEfficiencyPct: 50,
  },
  pilot_hardening: {
    label: "Pilot Hardening",
    collectionRate: 0.08,
    revenueShare: 0.02,
    minMonthlyCollection: 25_000,
    minEfficiencyPct: 50,
  },
  field_scale: {
    label: "Field Scale",
    collectionRate: 0.1,
    revenueShare: 0.025,
    minMonthlyCollection: 50_000,
    minEfficiencyPct: 60,
  },
  revenue_discipline: {
    label: "Revenue Discipline",
    collectionRate: 0.12,
    revenueShare: 0.03,
    minMonthlyCollection: 75_000,
    minEfficiencyPct: 65,
  },
};

export const DEFAULT_COMMISSION_PHASE_ID = "pilot_hardening";

export function getCommissionRule(phaseId) {
  return (
    COMMISSION_PHASE_RULES[phaseId] ||
    COMMISSION_PHASE_RULES[DEFAULT_COMMISSION_PHASE_ID]
  );
}
