/**
 * Founder journey templates (copy + structure).
 * Progress and phase status come from founderPhaseEngine.js (V2).
 */

export const FOUNDER_JOURNEY_VERSION = "v2";

export const FOUNDER_JOURNEY_META = {
  programTitle: "PrimeCare Year 1",
  programSubtitle: "Founder navigation · data-driven journey",
};

/** @typedef {Object} MilestoneTemplate */

export const FOUNDER_MILESTONE_TEMPLATES = [
  {
    id: "platform_built",
    phaseId: "foundation",
    title: "Platform built",
    description: "Portal shell and tenant session active.",
    owner: "Engineering",
    action: "dashboard",
  },
  {
    id: "tenant_isolation",
    phaseId: "foundation",
    title: "Tenant isolation",
    description: "Collections and reads scoped to active tenant.",
    owner: "Platform",
    action: "dashboard",
  },
  {
    id: "ops_control_tower",
    phaseId: "operational_core",
    title: "Operations control tower",
    description: "Interventions, feed, and ledger wired.",
    owner: "Engineering",
    action: "dashboard",
  },
  {
    id: "evidence_layer",
    phaseId: "operational_core",
    title: "Evidence layer",
    description: "Visit proof stored durably (not mostly local-embedded).",
    owner: "Platform",
    action: "operationsCenter",
  },
  {
    id: "pilot_hardening",
    phaseId: "pilot_hardening",
    title: "Pilot hardening",
    description: "Pilot Readiness score from live ops signals.",
    owner: "Executive",
    action: "founderNavigation",
  },
  {
    id: "visit_proof_80",
    phaseId: "pilot_hardening",
    title: "Visit proof ≥ 80%",
    description: "Recent visits have photo proof attached.",
    owner: "Field",
    action: "operationsCenter",
    lockedUntilPhase: "pilot_hardening",
  },
  {
    id: "collections_health",
    phaseId: "pilot_hardening",
    title: "Collections health",
    description: "Overdue lab concentration under control.",
    owner: "Collections",
    action: "risk",
  },
  {
    id: "predator_integrity",
    phaseId: "pilot_hardening",
    title: "Operational integrity",
    description: "Feed dedupe, task linkage, ledger consistency.",
    owner: "QA",
    action: "predatorDebug",
  },
  {
    id: "agent_field_qa",
    phaseId: "pilot_hardening",
    title: "Agent field QA",
    description: "Visits logged in the last 14 days.",
    owner: "Field",
    action: "operationsCenter",
  },
  {
    id: "lab_ordering_flow",
    phaseId: "pilot_hardening",
    title: "Lab ordering flow",
    description: "At least one order in the tenant pipeline.",
    owner: "Ops",
    action: "orders",
  },
  {
    id: "field_scale_ready",
    phaseId: "field_scale",
    title: "Field scale unlocked",
    description: "All pilot unlock gates passed.",
    owner: "Executive",
    action: "founderNavigation",
    lockedUntilPhase: "field_scale",
  },
  {
    id: "revenue_discipline_ready",
    phaseId: "revenue_discipline",
    title: "Revenue discipline",
    description: "Sustained field scale before revenue phase.",
    owner: "Executive",
    action: "risk",
    lockedUntilPhase: "revenue_discipline",
  },
];

export const FOUNDER_PHASE_TEMPLATES = [
  {
    id: "foundation",
    title: "Foundation",
    shortLabel: "Foundation",
    window: "Months 1–2",
    headline: "Auth, tenant isolation, portal shell",
  },
  {
    id: "operational_core",
    title: "Operational Core",
    shortLabel: "Ops core",
    window: "Months 3–5",
    headline: "Control Tower, tasks, evidence, ledger",
  },
  {
    id: "pilot_hardening",
    title: "Pilot Hardening",
    shortLabel: "Pilot",
    window: "Now",
    headline: "Trust, mobile QA, pilot readiness gates",
  },
  {
    id: "field_scale",
    title: "Field Scale",
    shortLabel: "Scale",
    window: "Months 7–9",
    headline: "Territory coverage and visit cadence at volume",
  },
  {
    id: "revenue_discipline",
    title: "Revenue Discipline",
    shortLabel: "Revenue",
    window: "Months 10–12",
    headline: "Collections velocity and strategic accounts",
  },
];

/** @deprecated V1 static journey — use buildFounderPhaseEngineView */
export const FOUNDER_JOURNEY = {
  ...FOUNDER_JOURNEY_META,
  currentPhaseId: "pilot_hardening",
  year1ProgressPercent: 0,
  year1MilestonesCompleted: 0,
  year1MilestonesTotal: FOUNDER_MILESTONE_TEMPLATES.length,
  phases: FOUNDER_PHASE_TEMPLATES.map((p) => ({ ...p, status: "upcoming" })),
  whereWeAreNow: "Load operational data to compute journey progress.",
  currentGoal: { title: "Pilot Readiness", summary: "", successCriteria: [] },
  nextUnlock: { title: "Field Scale", summary: "", unlocksWhen: [], portalHint: "operationsCenter" },
  blockers: [],
};

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
