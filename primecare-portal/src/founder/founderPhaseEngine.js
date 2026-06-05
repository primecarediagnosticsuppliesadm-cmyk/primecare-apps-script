import {
  FOUNDER_JOURNEY_META,
  FOUNDER_MILESTONE_TEMPLATES,
  FOUNDER_PHASE_TEMPLATES,
} from "@/founder/founderJourneyDefinition.js";
import {
  computeFounderOperationalSignals,
  PILOT_READINESS_TARGET,
} from "@/founder/founderPilotReadinessCompute.js";
import { buildLabContractModel } from "@/labContract/labContractEngine.js";

/** @typedef {'completed' | 'in_progress' | 'blocked' | 'locked'} MilestoneStatus */
/** @typedef {'complete' | 'current' | 'blocked' | 'locked' | 'upcoming'} PhaseVisualStatus */

function clampPct(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function milestoneStatus(pass, blocked, locked) {
  if (locked) return "locked";
  if (blocked) return "blocked";
  if (pass) return "completed";
  return "in_progress";
}

/**
 * Resolve milestone rows from live signals.
 */
function buildDynamicMilestones(signals) {
  const s = signals;
  const gatesById = Object.fromEntries((s.unlockGates || []).map((g) => [g.id, g]));

  return FOUNDER_MILESTONE_TEMPLATES.map((m) => {
    let pass = false;
    let blocked = false;
    let locked = m.lockedUntilPhase != null;
    let current = 0;
    let target = 100;
    let unit = "%";

    switch (m.id) {
      case "platform_built":
        pass = Boolean(s.tenantId) && !s.dataStale;
        current = pass ? 100 : 0;
        locked = false;
        break;
      case "tenant_isolation":
        pass = gatesById.tenant_isolation?.pass ?? false;
        current = pass ? 100 : 0;
        locked = false;
        break;
      case "ops_control_tower":
        pass = Boolean(s.execModel?.feed?.length) || s.ledgerEvents > 0;
        current = pass ? 100 : s.ledgerEvents > 0 ? 50 : 0;
        locked = false;
        break;
      case "evidence_layer":
        pass = gatesById.evidence_storage?.pass ?? false;
        blocked = s.localEvidenceCount > 0 && !pass;
        current = s.componentScores?.evidenceStorage ?? 0;
        locked = false;
        break;
      case "pilot_hardening":
        pass = s.pilotReadinessPct >= PILOT_READINESS_TARGET;
        current = s.pilotReadinessPct;
        target = PILOT_READINESS_TARGET;
        locked = false;
        break;
      case "visit_proof_80":
        pass = s.proofCompliancePct >= 80;
        current = s.proofCompliancePct;
        target = 80;
        locked = !gatesById.pilot_readiness_90?.pass;
        blocked = s.proofCompliancePct > 0 && s.proofCompliancePct < 50;
        break;
      case "collections_health":
        pass = s.collectionsHealth >= 70;
        current = s.collectionsHealth;
        target = 70;
        locked = false;
        break;
      case "predator_integrity":
        pass =
          (s.componentScores?.integrity ?? 0) >= 85 &&
          s.feedDupes === 0 &&
          s.taskLinkageOk !== false;
        current = s.componentScores?.integrity ?? 0;
        locked = false;
        break;
      case "agent_field_qa":
        pass = gatesById.agent_workflow?.pass ?? false;
        current = s.visits14d;
        target = 3;
        unit = "visits";
        locked = false;
        blocked = s.visitsLogged > 0 && s.visits14d === 0;
        break;
      case "lab_ordering_flow":
        pass = gatesById.lab_ordering?.pass ?? false;
        current = s.totalOrders;
        target = 1;
        unit = "orders";
        locked = false;
        break;
      case "field_scale_ready":
        locked = !s.fieldScaleUnlocked;
        pass = s.fieldScaleUnlocked;
        current = pass ? 100 : 0;
        break;
      case "revenue_discipline_ready":
        locked = !s.fieldScaleUnlocked || s.visits14d < 8;
        pass = false;
        current = 0;
        break;
      default:
        break;
    }

    const status = milestoneStatus(pass, blocked, locked);
    const gap = Math.max(0, target - current);

    return {
      ...m,
      status,
      pass,
      blocked,
      locked,
      current,
      target,
      unit,
      gap,
      progressPct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
    };
  });
}

function resolveCurrentPhaseId(signals, milestones) {
  if (signals.fieldScaleUnlocked) {
    const fieldMilestones = milestones.filter((m) =>
      ["visit_proof_80", "collections_health", "agent_field_qa"].includes(m.id)
    );
    const fieldDone = fieldMilestones.every((m) => m.pass);
    if (fieldDone && signals.visits14d >= 8) return "revenue_discipline";
    return "field_scale";
  }
  const coreDone = milestones
    .filter((m) =>
      ["platform_built", "tenant_isolation", "ops_control_tower", "evidence_layer"].includes(
        m.id
      )
    )
    .every((m) => m.pass);
  if (coreDone || signals.pilotReadinessPct >= 40) return "pilot_hardening";
  if (signals.dataStale) return "foundation";
  return "operational_core";
}

function buildPhaseBlocks(signals, currentPhaseId, milestones) {
  return FOUNDER_PHASE_TEMPLATES.map((phase, index) => {
    const phaseMilestones = milestones.filter((m) => m.phaseId === phase.id);
    const completed = phaseMilestones.filter((m) => m.status === "completed").length;
    const blocked = phaseMilestones.some((m) => m.status === "blocked");
    const total = phaseMilestones.length || 1;
    const progressPct = clampPct(Math.round((completed / total) * 100));

    let visualStatus = "upcoming";
    if (phase.id === currentPhaseId) {
      visualStatus = blocked ? "blocked" : "current";
    } else if (index < FOUNDER_PHASE_TEMPLATES.findIndex((p) => p.id === currentPhaseId)) {
      visualStatus = progressPct >= 100 ? "complete" : blocked ? "blocked" : "complete";
    } else if (phase.id === "field_scale" && !signals.fieldScaleUnlocked) {
      visualStatus = "locked";
    } else if (phase.id === "revenue_discipline") {
      visualStatus = signals.fieldScaleUnlocked ? "locked" : "locked";
      if (currentPhaseId === "revenue_discipline") visualStatus = "current";
      else if (
        FOUNDER_PHASE_TEMPLATES.findIndex((p) => p.id === currentPhaseId) >
        FOUNDER_PHASE_TEMPLATES.findIndex((p) => p.id === phase.id)
      ) {
        visualStatus = "upcoming";
      }
    }

    if (progressPct >= 100 && visualStatus !== "current") visualStatus = "complete";

    return {
      ...phase,
      visualStatus,
      progressPct,
      completedMilestones: completed,
      milestoneCount: total,
      blocked,
      showArrow: index < FOUNDER_PHASE_TEMPLATES.length - 1,
    };
  });
}

function buildDynamicBlockers(signals, milestones) {
  const blockers = [];

  if (signals.dataStale) {
    blockers.push({
      id: "no-ops-data",
      title: "No operational data loaded",
      detail: "Collections, visits, and orders are empty for this tenant.",
      severity: "high",
      owner: "Data",
      action: "dashboard",
    });
  }

  if (signals.localEvidenceCount > 0) {
    blockers.push({
      id: "evidence-local",
      title: "Evidence not fully durable",
      detail: `${signals.localEvidenceCount} proof file(s) still local-embedded — run storage migration.`,
      severity: "medium",
      owner: "Platform",
      action: "operationsCenter",
    });
  }

  if (signals.overdueLabs >= 3) {
    blockers.push({
      id: "collections-overdue",
      title: "Collections recovery pressure",
      detail: `${signals.overdueLabs} labs overdue — executive collections rhythm needed.`,
      severity: "high",
      owner: "Collections",
      action: "risk",
    });
  }

  if (signals.overdueInterventions >= 2) {
    blockers.push({
      id: "interventions-aging",
      title: "Aging interventions",
      detail: `${signals.overdueInterventions} interventions need executive resolution.`,
      severity: "high",
      owner: "Executive",
      action: "dashboard",
    });
  }

  const failingGate = (signals.unlockGates || []).find((g) => !g.pass);
  if (failingGate && !signals.fieldScaleUnlocked) {
    blockers.push({
      id: `gate-${failingGate.id}`,
      title: failingGate.label,
      detail: `Current ${failingGate.current} · target ${failingGate.target}`,
      severity: "medium",
      owner: "Pilot QA",
      action: "founderNavigation",
    });
  }

  for (const m of milestones.filter((m) => m.status === "blocked")) {
    blockers.push({
      id: `ms-${m.id}`,
      title: m.title,
      detail: m.description,
      severity: "medium",
      owner: m.owner,
      action: m.action,
    });
  }

  const seen = new Set();
  return blockers.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

/**
 * Deterministic top-3 daily focus actions.
 */
function buildDailyFocus(signals, blockers, milestones) {
  const candidates = [];

  const topBlocker = blockers.find((b) => b.severity === "high") || blockers[0];
  if (topBlocker) {
    candidates.push({
      priority: 100,
      title: `Fix: ${topBlocker.title}`,
      detail: topBlocker.detail,
      action: topBlocker.action,
      icon: "blocker",
    });
  }

  if (signals.pilotReadinessGap > 0) {
    const failing = (signals.unlockGates || []).filter((g) => !g.pass)[0];
    candidates.push({
      priority: 95,
      title: "Raise Pilot Readiness",
      detail: failing
        ? `${failing.label} (${failing.current} / ${failing.target})`
        : `Current ${signals.pilotReadinessPct}% · target ${PILOT_READINESS_TARGET}%`,
      action: "founderNavigation",
      icon: "readiness",
    });
  }

  if (signals.overdueInterventions > 0) {
    candidates.push({
      priority: 90,
      title: "Resolve overdue interventions",
      detail: `${signals.overdueInterventions} item(s) in Control Tower need ownership.`,
      action: "dashboard",
      icon: "intervention",
    });
  }

  if (signals.missingProofDrift > 0 || signals.proofCompliancePct < 80) {
    candidates.push({
      priority: 85,
      title: "Upload missing visit proof",
      detail: `Proof compliance at ${signals.proofCompliancePct}% · target 80%.`,
      action: "operationsCenter",
      icon: "proof",
    });
  }

  const pendingQa = milestones.filter(
    (m) => m.status === "in_progress" && m.id === "agent_field_qa"
  );
  if (pendingQa.length) {
    candidates.push({
      priority: 80,
      title: "Complete agent field QA",
      detail: `Run visit + collections flows on device (${signals.visits14d} visits in 14d).`,
      action: "operationsCenter",
      icon: "qa",
    });
  }

  if (!signals.fieldScaleUnlocked && signals.pilotReadinessPct >= 80) {
    candidates.push({
      priority: 75,
      title: "Close remaining unlock gates",
      detail: (signals.unlockGates || [])
        .filter((g) => !g.pass)
        .map((g) => g.label)
        .slice(0, 2)
        .join(" · "),
      action: "founderNavigation",
      icon: "unlock",
    });
  }

  if (signals.totalOrders === 0) {
    candidates.push({
      priority: 70,
      title: "Test lab ordering flow",
      detail: "No orders in tenant — place a test order end-to-end.",
      action: "orders",
      icon: "orders",
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const unique = [];
  const titles = new Set();
  for (const c of candidates) {
    if (unique.length >= 3) break;
    if (titles.has(c.title)) continue;
    titles.add(c.title);
    unique.push(c);
  }
  return unique;
}

/**
 * Build full dynamic founder journey view.
 */
export function buildFounderPhaseEngineView(payload, tenantId, options = {}) {
  const signals = computeFounderOperationalSignals(payload, tenantId);
  const milestones = buildDynamicMilestones(signals);
  const currentPhaseId = options.forcePhaseId || resolveCurrentPhaseId(signals, milestones);
  const phases = buildPhaseBlocks(signals, currentPhaseId, milestones);
  const currentPhase = phases.find((p) => p.id === currentPhaseId) || phases[2];
  const currentIndex = phases.findIndex((p) => p.id === currentPhaseId);
  const nextPhase = phases[currentIndex + 1] || null;

  const completedMilestones = milestones.filter((m) => m.status === "completed").length;
  const year1ProgressPercent = clampPct(
    (completedMilestones / milestones.length) * 100
  );

  const blockers = buildDynamicBlockers(signals, milestones);
  const dailyFocus = buildDailyFocus(signals, blockers, milestones);

  const failingGates = (signals.unlockGates || []).filter((g) => !g.pass);

  const whereWeAreNow = signals.dataStale
    ? "Tenant has no operational data yet — load AR, visits, and orders before pilot sign-off."
    : signals.fieldScaleUnlocked
      ? `Pilot gates passed. Field Scale is active — ${signals.activeLabs} labs, ${signals.visits14d} visits (14d).`
      : `Pilot Hardening — readiness ${signals.pilotReadinessPct}% (target ${PILOT_READINESS_TARGET}%). ${signals.activeLabs} active labs, proof ${signals.proofCompliancePct}%.`;

  const portfolioContracts = Array.isArray(options.contracts) ? options.contracts : [];
  const distributorIds = new Set([String(tenantId || "").trim()].filter(Boolean));
  for (const c of portfolioContracts) {
    const did = String(c?.distributorId || "").trim();
    if (did) distributorIds.add(did);
  }
  const contractModel = buildLabContractModel(portfolioContracts, payload, distributorIds);

  return {
    ...FOUNDER_JOURNEY_META,
    version: "v2",
    dataDriven: true,
    contractPipeline: contractModel.growth,
    contractDashboard: contractModel.dashboard,
    signals,
    milestones,
    phases,
    currentPhaseId,
    currentPhase,
    nextPhase,
    currentIndex,
    completedPhases: phases.filter((p) => p.visualStatus === "complete").length,
    phaseCount: phases.length,
    year1ProgressPercent,
    year1MilestonesCompleted: completedMilestones,
    year1MilestonesTotal: milestones.length,
    whereWeAreNow,
    currentGoal: {
      title: "Pilot Readiness",
      summary: "Deterministic score from live ops data, Predator-aligned gates, and field proof.",
      target: PILOT_READINESS_TARGET,
      current: signals.pilotReadinessPct,
      gap: signals.pilotReadinessGap,
      unit: "%",
      blockingIssues: failingGates.map((g) => g.label),
    },
    nextUnlock: {
      title: nextPhase?.title || "Field Scale",
      summary: signals.fieldScaleUnlocked
        ? "Field Scale phase is unlocked — grow visit cadence and territory coverage."
        : "Unlock Field Scale when all pilot gates pass.",
      unlocksWhen: (signals.unlockGates || []).map(
        (g) => `${g.label} — ${g.pass ? "PASS" : `${g.current} / ${g.target}`}`
      ),
      portalHint: "operationsCenter",
      unlocked: signals.fieldScaleUnlocked,
    },
    blockers,
    highBlockers: blockers.filter((b) => b.severity === "high"),
    dailyFocus,
    blockerCount: blockers.length,
  };
}
