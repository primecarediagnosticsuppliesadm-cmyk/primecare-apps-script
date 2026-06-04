/**
 * Static Year-1 founder targets (no forecasting API).
 * Revenue estimate uses dashboard daily fulfilled × working-day multiplier.
 */

export const YEAR1_TARGETS = {
  activeLabs: 10,
  /** INR monthly revenue target for Year 1 exit rate */
  monthlyRevenue: 1_200_000,
  /** Daily fulfilled revenue → monthly estimate multiplier */
  revenueDaysPerMonth: 22,
  visitsPerLabPerMonth: 4,
  proofCompliancePct: 80,
  pilotReadinessPct: 90,
};

export const YEAR1_QUARTERS = [
  { id: "q1", label: "Month 1–3", phaseIds: ["foundation", "operational_core"] },
  { id: "q2", label: "Month 4–6", phaseIds: ["pilot_hardening"] },
  { id: "q3", label: "Month 7–9", phaseIds: ["field_scale"] },
  { id: "q4", label: "Month 10–12", phaseIds: ["revenue_discipline"] },
];
