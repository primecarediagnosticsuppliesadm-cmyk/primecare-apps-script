import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { buildFounderPhaseEngineView } from "@/founder/founderPhaseEngine.js";
import { computeFounderOperationalSignals, PILOT_READINESS_TARGET } from "@/founder/founderPilotReadinessCompute.js";
import { YEAR1_TARGETS, YEAR1_QUARTERS } from "@/founder/founderStrategyTargets.js";
import { labIdKey } from "@/utils/labId.js";
import { readLabContractRegistry } from "@/labContract/labContractStore.js";
import { buildLabContractModel } from "@/labContract/labContractEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function inDays(iso, minDay, maxDay) {
  const s = str(iso).slice(0, 10);
  if (!s) return false;
  const age = Math.floor((Date.now() - Date.parse(s)) / 86400000);
  return age >= minDay && age < maxDay;
}

/**
 * Top 5 founder priorities (deterministic impact × urgency).
 */
function buildTodayPriorities(signals, journey, collSummary) {
  const candidates = [];

  if (!signals.fieldScaleUnlocked && signals.pilotReadinessGap > 0) {
    candidates.push({
      id: "pilot-readiness",
      title: "Close pilot readiness gap",
      impactScore: clamp(95 - signals.pilotReadinessGap / 3),
      urgency: signals.pilotReadinessGap <= 10 ? "High" : "Critical",
      outcome: `Unlock Field Scale · readiness ${signals.pilotReadinessPct}% → ${PILOT_READINESS_TARGET}%`,
      page: "founderNavigation",
      sortKey: 100 - signals.pilotReadinessPct,
    });
  }

  if (signals.overdueInterventions > 0) {
    candidates.push({
      id: "interventions",
      title: "Resolve aging interventions",
      impactScore: clamp(90 + Math.min(5, signals.overdueInterventions)),
      urgency: signals.overdueInterventions >= 3 ? "Critical" : "High",
      outcome: "Raises Pilot Readiness and intervention closure health",
      page: "dashboard",
      sortKey: 88 + signals.overdueInterventions,
    });
  }

  if (signals.overdueLabs > 0) {
    candidates.push({
      id: "collections",
      title: "Collect overdue receivables",
      impactScore: clamp(88 + Math.min(8, signals.overdueLabs)),
      urgency: signals.overdueLabs >= 5 ? "Critical" : "High",
      outcome: `Improves cash flow · ${formatInr(collSummary.totalOutstanding)} outstanding`,
      page: "risk",
      sortKey: 86 + signals.overdueLabs,
    });
  }

  if (signals.proofCompliancePct < YEAR1_TARGETS.proofCompliancePct) {
    candidates.push({
      id: "proof",
      title: "Raise visit proof compliance",
      impactScore: clamp(85 + (YEAR1_TARGETS.proofCompliancePct - signals.proofCompliancePct) / 2),
      urgency: signals.proofCompliancePct < 50 ? "Critical" : "High",
      outcome: `Field proof at ${signals.proofCompliancePct}% · target ${YEAR1_TARGETS.proofCompliancePct}%`,
      page: "operationsCenter",
      sortKey: 84,
    });
  }

  if (signals.qualificationsPending >= 2) {
    candidates.push({
      id: "qualification",
      title: "Clear qualification pipeline",
      impactScore: 82,
      urgency: "Medium",
      outcome: `${signals.qualificationsPending} labs awaiting founder review`,
      page: "qualificationReview",
      sortKey: 80,
    });
  }

  const pendingQual = signals.qualificationsPending;
  if (pendingQual > 0 && signals.totalOrders === 0) {
    candidates.push({
      id: "first-order",
      title: "Close first reagent rental / order",
      impactScore: 95,
      urgency: "High",
      outcome: "Activates lab ordering flywheel",
      page: "orders",
      sortKey: 94,
    });
  }

  if (signals.totalOrders > 0 && signals.completedOrders === 0) {
    candidates.push({
      id: "fulfillment",
      title: "Complete open order fulfillment",
      impactScore: 87,
      urgency: "High",
      outcome: `${signals.openOrders} open orders blocking revenue recognition`,
      page: "orders",
      sortKey: 83,
    });
  }

  if (signals.localEvidenceCount > 0) {
    candidates.push({
      id: "evidence-migration",
      title: "Finish evidence storage migration",
      impactScore: 80,
      urgency: "Medium",
      outcome: "Durable proof for audit and pilot sign-off",
      page: "operationsCenter",
      sortKey: 78,
    });
  }

  if (signals.dataStale) {
    candidates.push({
      id: "load-data",
      title: "Load tenant operational data",
      impactScore: 99,
      urgency: "Critical",
      outcome: "Strategy engine needs AR, visits, and orders",
      page: "operationsCenter",
      sortKey: 99,
    });
  }

  candidates.sort((a, b) => b.sortKey - a.sortKey || b.impactScore - a.impactScore);
  const seen = new Set();
  const top = [];
  for (const c of candidates) {
    if (top.length >= 5) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    top.push(c);
  }
  return top;
}

function buildRevenueGap(payload, signals) {
  const executive = payload.dashboard?.executive || {};
  const dailyRevenue = Number(executive.todaysRevenue ?? 0);
  const currentMonthly = signals.dataStale
    ? 0
    : clamp(dailyRevenue * YEAR1_TARGETS.revenueDaysPerMonth);

  const currentLabs = signals.activeLabs;
  const targetLabs = YEAR1_TARGETS.activeLabs;
  const labGap = Math.max(0, targetLabs - currentLabs);
  const labProgress = targetLabs > 0 ? clamp((currentLabs / targetLabs) * 100) : 0;

  const revenueGap = Math.max(0, YEAR1_TARGETS.monthlyRevenue - currentMonthly);
  const revenueProgress =
    YEAR1_TARGETS.monthlyRevenue > 0
      ? clamp((currentMonthly / YEAR1_TARGETS.monthlyRevenue) * 100)
      : 0;

  return {
    currentLabs,
    targetLabs,
    labGap,
    labProgressPct: labProgress,
    currentMonthlyRevenue: currentMonthly,
    currentMonthlyLabel: formatInr(currentMonthly),
    targetMonthlyRevenue: YEAR1_TARGETS.monthlyRevenue,
    targetMonthlyLabel: formatInr(YEAR1_TARGETS.monthlyRevenue),
    revenueGap,
    revenueGapLabel: formatInr(revenueGap),
    revenueProgressPct: revenueProgress,
    revenueGapPct: Math.max(0, 100 - revenueProgress),
    estimateNote: signals.dataStale
      ? "No revenue signal — load orders and dashboard data"
      : `Estimated from ₹${dailyRevenue.toLocaleString("en-IN")} daily fulfilled × ${YEAR1_TARGETS.revenueDaysPerMonth} days`,
  };
}

function buildFlywheel(payload, signals) {
  const visits = payload.visits || [];
  const orders = payload.orders || [];
  const qualifications = payload.qualifications || [];
  const collections = payload.collections || [];

  const visits30d = visits.filter((v) => inDays(v.visitDate || v.date, 0, 30)).length;
  const qualActive = qualifications.filter((q) => {
    const s = str(q.stage).toLowerCase();
    return s && !s.includes("reject");
  }).length;
  const ordersTotal = orders.length;
  const collectionsActive = collections.filter(
    (c) => Number(c.overdueDays) === 0 || Number(c.outstandingAmount) > 0
  ).length;
  const labsWithRecentVisit = new Set(
    visits
      .filter((v) => inDays(v.visitDate || v.date, 0, 30))
      .map((v) => labIdKey(v.labId))
      .filter(Boolean)
  ).size;
  const visitCountByLab = new Map();
  for (const v of visits) {
    if (!inDays(v.visitDate || v.date, 0, 60)) continue;
    const lid = labIdKey(v.labId);
    if (!lid) continue;
    visitCountByLab.set(lid, (visitCountByLab.get(lid) || 0) + 1);
  }
  const expansionLabs = [...visitCountByLab.values()].filter((c) => c >= 2).length;

  const fulfilled = orders.filter((o) => {
    const s = str(o.orderStatus).toLowerCase();
    return s.includes("fulfill") || s.includes("delivered");
  });
  const revenueUnits = fulfilled.reduce(
    (s, o) => s + Number(o.orderValue || o.totalAmount || o.amount || 0),
    0
  );

  const stages = [
    { key: "visit", label: "Visit", count: visits30d },
    { key: "qualification", label: "Qualification", count: qualActive },
    { key: "order", label: "Order", count: ordersTotal },
    { key: "collection", label: "Collection", count: collectionsActive },
    { key: "active_lab", label: "Active lab", count: labsWithRecentVisit },
    { key: "expansion", label: "Expansion", count: expansionLabs },
    { key: "revenue", label: "Revenue", count: fulfilled.length, sub: formatInr(revenueUnits) },
  ];

  let bottleneck = stages[0];
  let minRatio = Infinity;
  for (let i = 0; i < stages.length - 1; i++) {
    const curr = stages[i].count;
    const next = stages[i + 1].count || 0;
    const ratio = curr > 0 ? next / curr : 0;
    if (ratio < minRatio) {
      minRatio = ratio;
      bottleneck = stages[i + 1];
    }
  }
  if (visits30d === 0) bottleneck = stages[0];

  return { stages, bottleneck };
}

function buildMilestoneUnlock(journey) {
  const next = journey.nextPhase || { title: "Field Scale", id: "field_scale" };
  const gates = journey.signals?.unlockGates || [];
  const milestones = journey.milestones || [];

  const completed = [];
  const blocked = [];
  const required = [];

  for (const g of gates) {
    const row = {
      label: g.label,
      pass: g.pass,
      detail: g.pass ? "Complete" : `${g.current} / ${g.target}`,
    };
    if (g.pass) completed.push(row);
    else required.push(row);
  }

  for (const m of milestones.filter((m) => m.status === "blocked")) {
    blocked.push({
      label: m.title,
      pass: false,
      detail: `${m.current}${m.unit === "%" ? "%" : ` ${m.unit}`} / ${m.target}`,
    });
  }

  const currentMilestone =
    milestones.find((m) => m.status === "in_progress") ||
    journey.currentPhase ||
    { title: "Pilot Hardening" };

  return {
    currentMilestone: currentMilestone.title || journey.currentPhase?.title,
    nextMilestone: next.title,
    completedConditions: completed,
    requiredConditions: required,
    blockedConditions: blocked,
    unlocked: journey.signals?.fieldScaleUnlocked,
  };
}

function buildNinetyDayPlan(signals, revenueGap) {
  const plan = [
    {
      horizon: "Now",
      target: `${PILOT_READINESS_TARGET}% pilot readiness`,
      current: `${signals.pilotReadinessPct}%`,
      gap: `${signals.pilotReadinessGap}%`,
      action: "Clear failing unlock gates in Founder Navigation",
      page: "founderNavigation",
    },
    {
      horizon: "Next 30 days",
      target: `${YEAR1_TARGETS.proofCompliancePct}% proof compliance`,
      current: `${signals.proofCompliancePct}%`,
      gap: `${Math.max(0, YEAR1_TARGETS.proofCompliancePct - signals.proofCompliancePct)}%`,
      action: "Field proof capture on every visit",
      page: "operationsCenter",
    },
    {
      horizon: "31–60 days",
      target: `${Math.ceil(YEAR1_TARGETS.activeLabs / 2)} active labs`,
      current: `${signals.activeLabs}`,
      gap: `${Math.max(0, Math.ceil(YEAR1_TARGETS.activeLabs / 2) - signals.activeLabs)}`,
      action: "Expand visit cadence and qualification throughput",
      page: "operationsCenter",
    },
    {
      horizon: "61–90 days",
      target: `${YEAR1_TARGETS.activeLabs} labs · ${formatInr(YEAR1_TARGETS.monthlyRevenue)}/mo`,
      current: `${revenueGap.currentLabs} labs · ${revenueGap.currentMonthlyLabel}`,
      gap: `${revenueGap.labGap} labs · ${revenueGap.revenueGapLabel}`,
      action: "Collections discipline + strategic account retention",
      page: "risk",
    },
  ];
  return plan;
}

function buildYear1Roadmap(journey) {
  const phases = journey.phases || [];
  return YEAR1_QUARTERS.map((q) => {
    const qPhases = phases.filter((p) => q.phaseIds.includes(p.id));
    const progress =
      qPhases.length > 0
        ? clamp(qPhases.reduce((s, p) => s + p.progressPct, 0) / qPhases.length)
        : 0;
    const hasCurrent = qPhases.some((p) => p.visualStatus === "current");
    const allComplete = qPhases.length > 0 && qPhases.every((p) => p.visualStatus === "complete");
    let status = "future";
    if (allComplete) status = "completed";
    else if (hasCurrent) status = "current";
    return {
      ...q,
      progressPct: progress,
      status,
      phases: qPhases.map((p) => p.title),
    };
  });
}

function buildHealthScores(signals, journey) {
  const closure = signals.intelligence?.reliability?.interventionClosureHealth ?? 50;
  const executionScore = clamp(
    (signals.proofCompliancePct * 0.35 +
      Math.min(100, signals.visits14d * 15) * 0.35 +
      closure * 0.3)
  );
  const revenueReadiness = clamp(
    (journey.year1ProgressPercent || 0) * 0.4 +
      signals.collectionsHealth * 0.3 +
      signals.componentScores?.orderFulfillment * 0.3
  );
  const overall = clamp(
    signals.pilotReadinessPct * 0.4 + executionScore * 0.35 + revenueReadiness * 0.25
  );

  return {
    overall,
    execution: executionScore,
    revenueReadiness,
    components: {
      pilotReadiness: signals.pilotReadinessPct,
      collectionsHealth: signals.collectionsHealth,
      fieldActivity: Math.min(100, signals.visits14d * 15),
      proofCompliance: signals.proofCompliancePct,
      interventionClosure: closure,
    },
  };
}

/**
 * Full founder strategy model.
 */
export function buildFounderStrategyModel(payload, tenantId) {
  const signals = computeFounderOperationalSignals(payload, tenantId);
  const journey = buildFounderPhaseEngineView(payload, tenantId);
  const collSummary = summarizeCollectionsList(payload.collections || []);
  const revenueGap = buildRevenueGap(payload, signals);
  const flywheel = buildFlywheel(payload, signals);

  const contractRegistry = readLabContractRegistry(tenantId);
  const distributors = new Set([str(tenantId)].filter(Boolean));
  const contractModel = buildLabContractModel(
    contractRegistry.contracts,
    payload,
    distributors
  );
  const contractPipeline = contractModel.growth;
  const revenueGapWithContracts = {
    ...revenueGap,
    monthlyCommittedContracts: contractPipeline.monthlyCommittedRevenue,
    monthlyCommittedLabel: contractPipeline.monthlyCommittedLabel,
    activeContractCount: contractPipeline.activeContractCount,
  };

  const growthBlocker = signals.dataStale
    ? "No operational data loaded"
    : journey.blockers?.[0]?.title
      ? journey.blockers[0].title
      : flywheel.bottleneck
        ? `${flywheel.bottleneck.label} is the flywheel bottleneck`
        : "Pilot readiness below Field Scale unlock";

  return {
    version: "v1",
    signals,
    journey,
    todayPriorities: buildTodayPriorities(signals, journey, collSummary),
    revenueGap: revenueGapWithContracts,
    contractPipeline,
    contractDashboard: contractModel.dashboard,
    milestoneUnlock: buildMilestoneUnlock(journey),
    flywheel,
    ninetyDayPlan: buildNinetyDayPlan(signals, revenueGapWithContracts),
    year1Roadmap: buildYear1Roadmap(journey),
    health: buildHealthScores(signals, journey),
    growthBlocker,
  };
}
