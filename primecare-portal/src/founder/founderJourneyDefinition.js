/**
 * Static Year-1 founder journey map (no API / AI / forecasting).
 * Update phase ids and copy as the program advances.
 */

export const FOUNDER_JOURNEY_VERSION = "v1";

/** @typedef {'complete' | 'current' | 'upcoming'} PhaseStatus */

/**
 * @typedef {Object} JourneyPhase
 * @property {string} id
 * @property {string} title
 * @property {string} shortLabel
 * @property {PhaseStatus} status
 * @property {string} window
 * @property {string} headline
 */

/**
 * @typedef {Object} JourneyBlocker
 * @property {string} id
 * @property {string} title
 * @property {string} detail
 * @property {'high' | 'medium' | 'low'} severity
 * @property {string} owner
 */

export const FOUNDER_JOURNEY = {
  programTitle: "PrimeCare Year 1",
  programSubtitle: "Founder navigation · operational journey",
  /** Active phase id */
  currentPhaseId: "pilot_hardening",
  /** 0–100 deterministic milestone completion for Year 1 */
  year1ProgressPercent: 58,
  year1MilestonesCompleted: 7,
  year1MilestonesTotal: 12,
  whereWeAreNow:
    "Operational core is live. We are hardening trust, field execution, and executive visibility before scaling agent coverage.",
  phases: [
    {
      id: "foundation",
      title: "Foundation",
      shortLabel: "Foundation",
      status: "complete",
      window: "Months 1–2",
      headline: "Auth, tenant isolation, and portal shell",
    },
    {
      id: "operational_core",
      title: "Operational Core",
      shortLabel: "Ops core",
      status: "complete",
      window: "Months 3–5",
      headline: "Control Tower, interventions, tasks, evidence, ledger",
    },
    {
      id: "pilot_hardening",
      title: "Pilot Hardening",
      shortLabel: "Pilot",
      status: "current",
      window: "Month 6 · now",
      headline: "Trust, mobile field QA, Predator PASS, pilot readiness",
    },
    {
      id: "field_scale",
      title: "Field Scale",
      shortLabel: "Scale",
      status: "upcoming",
      window: "Months 7–9",
      headline: "Agent territory coverage and visit cadence at volume",
    },
    {
      id: "revenue_discipline",
      title: "Revenue Discipline",
      shortLabel: "Revenue",
      status: "upcoming",
      window: "Months 10–12",
      headline: "Collections velocity, credit discipline, strategic accounts",
    },
  ],
  currentGoal: {
    title: "Ship a trustworthy pilot",
    summary:
      "Every field action, intervention, and collection save must feel reliable on mobile and auditable in Control Tower.",
    successCriteria: [
      "Predator mostly PASS with actionable WARNs only",
      "No fake UI, placeholder timelines, or silent failures",
      "Executive reads operational state in under 30 seconds",
    ],
  },
  nextUnlock: {
    title: "Field Scale phase",
    summary:
      "Unlock when pilot labs run for 30 days with stable visit proof, collections follow-through, and intervention closure.",
    unlocksWhen: [
      "≥ 80% visit proof compliance on pilot labs",
      "Intervention closure health ≥ 70 for 14 days",
      "Agent mobile QA sign-off on visit + collections flows",
    ],
    portalHint: "operationsCenter",
  },
  blockers: [
    {
      id: "evidence-durability",
      title: "Evidence storage migration",
      detail: "Some proof still local-embedded until Supabase bucket migration is applied in tenant.",
      severity: "medium",
      owner: "Platform",
    },
    {
      id: "task-persistence",
      title: "Task state is device-local",
      detail: "Operational tasks reset on fresh browser until server-backed task read ships.",
      severity: "medium",
      owner: "Engineering",
    },
    {
      id: "collections-velocity",
      title: "Collections recovery velocity",
      detail: "Overdue AR concentration on pilot labs needs weekly executive collections rhythm.",
      severity: "high",
      owner: "Collections lead",
    },
  ],
};

/**
 * Resolved view for UI (derived from static definition).
 */
export function getFounderJourneyView(definition = FOUNDER_JOURNEY) {
  const phases = definition.phases || [];
  const currentPhase =
    phases.find((p) => p.id === definition.currentPhaseId) ||
    phases.find((p) => p.status === "current") ||
    phases[0];
  const currentIndex = phases.findIndex((p) => p.id === currentPhase?.id);
  const nextPhase = phases[currentIndex + 1] || null;
  const completedPhases = phases.filter((p) => p.status === "complete").length;

  return {
    ...definition,
    currentPhase,
    nextPhase,
    currentIndex,
    completedPhases,
    phaseCount: phases.length,
    highBlockers: (definition.blockers || []).filter((b) => b.severity === "high"),
    blockerCount: (definition.blockers || []).length,
  };
}
