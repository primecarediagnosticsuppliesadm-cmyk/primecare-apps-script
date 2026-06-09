/**
 * Deterministic executive intelligence (no AI / forecasting).
 * Reuses ops payload, interventions, tasks, and event ledger reads.
 */

import { labIdKey } from "@/utils/labId.js";
import { filterVisitProofEvidence } from "@/utils/operationalEvidenceUi.js";
import { loadInterventionRecords } from "@/operations/executiveInterventionStateStore.js";
import { readOperationalLedger } from "@/operations/operationalEventLedger.js";
import { buildExecutionAccountability } from "@/operations/operationalTaskWorkflow.js";
import { buildExecutiveOperationalTaskModel } from "@/operations/operationalTaskModel.js";
import { isQualificationPipelinePending } from "@/utils/qualificationPipeline.js";

const SEVERITY_RANK = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };
const MAX_DRIFT = 6;
const MAX_AGENTS = 5;
const MAX_LABS = 8;
const MAX_ESCALATION_INSIGHTS = 5;

function str(v) {
  return String(v ?? "").trim();
}

function parseYmd(raw) {
  const s = str(raw).slice(0, 10);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysSince(iso) {
  const d = parseYmd(iso);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function inDays(iso, minDay, maxDay) {
  const age = daysSince(iso);
  if (age == null) return false;
  return age >= minDay && age < maxDay;
}

function countVisitsInWindow(visits, minDay, maxDay) {
  return visits.filter((v) => inDays(v.visitDate || v.date, minDay, maxDay)).length;
}

function trendSignal(current, previous, higherIsBetter = true) {
  const delta = current - previous;
  const pct =
    previous > 0 ? Math.round((delta / previous) * 100) : current > 0 ? 100 : 0;
  let trend = "stable";
  if (Math.abs(pct) >= 10) {
    trend = (delta > 0) === higherIsBetter ? "improving" : "worsening";
  }
  return { trend, deltaPct: pct, current, previous };
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function visitsByLab(payload) {
  const map = new Map();
  for (const v of (payload.visits || []).slice(0, 200)) {
    const lid = labIdKey(v.labId);
    if (!lid) continue;
    const list = map.get(lid) || { labId: lid, labName: v.labName || lid, visits: [] };
    list.visits.push(v);
    map.set(lid, list);
  }
  return map;
}

/**
 * 1. Operational drift detection
 */
export function buildOperationalDriftSignals(payload, opsModel = {}) {
  const drifts = [];
  const topLabIds = new Set(
    (payload.dashboard?.executive?.topLabsByRevenue || []).map((l) =>
      labIdKey(l.labId || l.lab_id)
    )
  );

  for (const [lid, lab] of visitsByLab(payload)) {
    const recent = countVisitsInWindow(lab.visits, 0, 14);
    const prior = countVisitsInWindow(lab.visits, 14, 28);
    if (prior >= 2 && recent < prior * 0.6) {
      const t = trendSignal(recent, prior, true);
      drifts.push({
        id: `drift-visit-${lid}`,
        type: "visit_frequency",
        title: "Visit frequency declining",
        subtitle: lab.labName,
        labId: lid,
        severity: recent === 0 ? "CRITICAL" : "ATTENTION",
        firstDetected: `${28 - 14}d trend`,
        trend: t.trend,
        summary: `${prior} visits → ${recent} visits (14d windows)`,
        recommendedAction: "Schedule field visit and review territory coverage",
      });
    }
  }

  const collRecent = (payload.collections || []).filter((c) => Number(c.overdueDays) > 0);
  const overdueGrowing = collRecent.filter((c) => Number(c.overdueDays) >= 14).length;
  if (overdueGrowing >= 3) {
    drifts.push({
      id: "drift-collections-slow",
      type: "collections",
      title: "Collections slowing down",
      subtitle: `${overdueGrowing} accounts 14d+ overdue`,
      severity: overdueGrowing >= 6 ? "CRITICAL" : "ATTENTION",
      firstDetected: "Rolling window",
      trend: "worsening",
      summary: "Outstanding collections aging without recovery velocity",
      recommendedAction: "Escalate collections follow-up and credit review",
    });
  }

  const followUps = Number(opsModel.agents?.followUpsPending ?? 0);
  if (followUps >= 4) {
    drifts.push({
      id: "drift-followups",
      type: "followups",
      title: "Follow-ups increasing",
      subtitle: `${followUps} due or overdue`,
      severity: followUps >= 8 ? "CRITICAL" : "ATTENTION",
      firstDetected: "Today",
      trend: "worsening",
      summary: "Follow-up queue pressure on field teams",
      recommendedAction: "Assign follow-up owners from intervention queue",
    });
  }

  const pendingQual = (payload.qualifications || []).filter(isQualificationPipelinePending);
  if (pendingQual.length >= 3) {
    const staleQual = pendingQual.filter((q) => {
      const updated = daysSince(q.updatedAt || q.updated_at);
      return updated != null && updated >= 14;
    });
    if (staleQual.length >= 2) {
      drifts.push({
        id: "drift-qual-stagnation",
        type: "qualification",
        title: "Qualification pipeline stagnation",
        subtitle: `${staleQual.length} labs pending qualification`,
        severity: "ATTENTION",
        firstDetected: "14d+ unchanged",
        trend: "worsening",
        summary: "Qualification pipeline not progressing to qualified or won",
        recommendedAction: "Distributor OS → Labs → Qualification",
      });
    }
  }

  const missingProof = (opsModel.attention || []).filter((a) =>
    str(a.title).toLowerCase().includes("proof")
  );
  if (missingProof.length >= 3) {
    drifts.push({
      id: "drift-missing-proof",
      type: "missing_proof",
      title: "Repeated missing visit proof",
      subtitle: `${missingProof.length} flagged visits`,
      severity: "ATTENTION",
      firstDetected: "Current window",
      trend: "worsening",
      summary: "Visit proof gaps across multiple labs",
      recommendedAction: "Require proof on next field cycle",
    });
  }

  const driftHasInactiveAgent = new Set();
  for (const agent of opsModel.agents?.staleAgents || []) {
    if (driftHasInactiveAgent.has(agent.name)) continue;
    driftHasInactiveAgent.add(agent.name);
    drifts.push({
      id: `drift-agent-${agent.name}`,
      type: "inactive_agent",
      title: "Inactive agent",
      subtitle: agent.name,
      severity: "ATTENTION",
      firstDetected: agent.lastVisitDate || "7d+",
      trend: "worsening",
      summary: `No recent visits · last ${agent.lastVisitDate || "unknown"}`,
      recommendedAction: "Review agent territory and assign catch-up visits",
    });
  }

  const delayedOrders = (payload.orders || []).filter((o) => {
    const s = str(o.orderStatus).toLowerCase();
    if (s.includes("fulfill") || s.includes("cancel")) return false;
    const age = daysSince(o.orderDate || o.createdAt);
    return age != null && age >= 5;
  });
  if (delayedOrders.length >= 2) {
    drifts.push({
      id: "drift-delayed-orders",
      type: "delayed_fulfillment",
      title: "Repeated delayed fulfillment",
      subtitle: `${delayedOrders.length} open orders`,
      severity: "ATTENTION",
      firstDetected: "5d+ open",
      trend: "worsening",
      summary: "Orders not moving to fulfilled state",
      recommendedAction: "Review supply chain and order queue",
    });
  }

  for (const [lid, lab] of visitsByLab(payload)) {
    const stage = str(
      (payload.qualifications || []).find((q) => labIdKey(q.labId) === lid)?.stage
    ).toLowerCase();
    const isOnboarding = stage.includes("new") || stage.includes("onboard") || stage.includes("pending");
    const lastVisit = lab.visits
      .map((v) => v.visitDate || v.date)
      .sort()
      .pop();
    const silentDays = daysSince(lastVisit);
    if (isOnboarding && (silentDays == null || silentDays >= 21)) {
      drifts.push({
        id: `drift-silent-${lid}`,
        type: "post_onboarding_silent",
        title: "Lab silent after onboarding",
        subtitle: lab.labName,
        labId: lid,
        severity: topLabIds.has(lid) ? "CRITICAL" : "ATTENTION",
        firstDetected: silentDays != null ? `${silentDays}d` : "No visit",
        trend: "worsening",
        summary: "Onboarded lab with no sustained field engagement",
        recommendedAction: "Executive-backed re-engagement visit",
      });
    }
  }

  drifts.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));

  const deduped = [];
  const seenDrift = new Set();
  for (const d of drifts) {
    const key = d.labId ? `${d.type}:${d.labId}` : d.type;
    if (seenDrift.has(key)) continue;
    seenDrift.add(key);
    deduped.push(d);
  }
  return deduped.slice(0, MAX_DRIFT);
}

/**
 * 2. Agent quality intelligence
 */
export function buildAgentQualityIntelligence(payload, taskModel = null) {
  const tasks = taskModel?.allTasks || [];
  const accountability = buildExecutionAccountability(tasks);
  const agents = new Map();

  for (const v of (payload.visits || []).slice(0, 180)) {
    const name = str(v.agent || v.agentName) || "Unknown";
    const row = agents.get(name) || {
      name,
      visits: [],
      visitDays: new Set(),
      labs: new Set(),
    };
    row.visits.push(v);
    row.visitDays.add(str(v.visitDate || v.date).slice(0, 10));
    if (v.labId) row.labs.add(labIdKey(v.labId));
    agents.set(name, row);
  }

  const results = [];
  for (const [name, row] of agents) {
    const recentVisits = row.visits.filter((v) => inDays(v.visitDate || v.date, 0, 14)).length;
    const priorVisits = row.visits.filter((v) => inDays(v.visitDate || v.date, 14, 28)).length;
    const visitTrend = trendSignal(recentVisits, priorVisits, true);

    let proofRequired = 0;
    let proofLinked = 0;
    for (const v of row.visits.slice(0, 20)) {
      const vid = str(v.visitId || v.id);
      const proof = filterVisitProofEvidence(payload.evidence || [], vid);
      proofRequired += 1;
      if (proof.length) proofLinked += 1;
    }
    const proofPct = proofRequired > 0 ? Math.round((proofLinked / proofRequired) * 100) : 100;

    const acc = accountability.find((a) => a.agent === name) || {};
    const overdueRate =
      acc.assigned > 0 ? Math.round(((acc.overdue || 0) / acc.assigned) * 100) : 0;
    const visitConsistency = clampScore((recentVisits / 8) * 100);
    const collectionsEfficiency = clampScore(100 - overdueRate);
    const proofCompliance = clampScore(proofPct);
    const followUpDiscipline = clampScore(acc.followUpRate ?? 70);

    const reliabilityScore = clampScore(
      visitConsistency * 0.3 +
        proofCompliance * 0.25 +
        collectionsEfficiency * 0.25 +
        followUpDiscipline * 0.2
    );

    const pressureScore = clampScore(
      (acc.overdue || 0) * 12 +
        (acc.escalated || 0) * 18 +
        (recentVisits === 0 ? 25 : 0) +
        (proofPct < 50 ? 15 : 0)
    );

    const atRisk = reliabilityScore < 55 || pressureScore >= 70 || recentVisits === 0;

    results.push({
      name,
      reliabilityScore,
      pressureScore,
      atRisk,
      visitConsistency,
      proofCompliance: proofPct,
      collectionsEfficiency,
      staleFollowUpRate: overdueRate,
      qualificationConversionRate: followUpDiscipline,
      activityTrend: visitTrend.trend,
      overdueOwnership: acc.overdue || 0,
      assignedTasks: acc.assigned || 0,
      recentVisits,
    });
  }

  results.sort((a, b) => b.pressureScore - a.pressureScore || a.reliabilityScore - b.reliabilityScore);
  return results.slice(0, MAX_AGENTS);
}

/**
 * 3. Lab lifecycle intelligence
 */
export function buildLabLifecycleIntelligence(payload) {
  const topLabIds = new Set(
    (payload.dashboard?.executive?.topLabsByRevenue || []).map((l) =>
      labIdKey(l.labId || l.lab_id)
    )
  );
  const labs = new Map();

  for (const c of payload.collections || []) {
    const lid = labIdKey(c.labId);
    if (!lid) continue;
    labs.set(lid, {
      labId: lid,
      labName: c.labName || lid,
      outstanding: Number(c.outstandingAmount || 0),
      overdueDays: Number(c.overdueDays || 0),
      hold: str(c.creditHold || c.credit_hold).toUpperCase() === "HOLD",
    });
  }

  for (const [lid, lab] of visitsByLab(payload)) {
    const base = labs.get(lid) || {
      labId: lid,
      labName: lab.labName,
      outstanding: 0,
      overdueDays: 0,
      hold: false,
    };
    const recent = countVisitsInWindow(lab.visits, 0, 14);
    const prior = countVisitsInWindow(lab.visits, 14, 28);
    const lastVisit = lab.visits
      .map((v) => v.visitDate || v.date)
      .filter(Boolean)
      .sort()
      .pop();
    const qual = (payload.qualifications || []).find((q) => labIdKey(q.labId) === lid);
    const stage = str(qual?.stage || qual?.qualification_stage).toLowerCase();

    let lifecycle = "stable";
    let transition = "";

    if (topLabIds.has(lid)) lifecycle = "strategic_account";
    if (base.hold || base.overdueDays >= 14) {
      lifecycle = "collections_risk";
      transition = "Credit stress detected";
    } else if (
      stage.includes("new") ||
      stage.includes("onboard") ||
      stage.includes("pending")
    ) {
      lifecycle = "onboarding";
      transition = recent > 0 ? "Onboarding with visits" : "Onboarding without visits";
    } else if (recent === 0 && daysSince(lastVisit) != null && daysSince(lastVisit) >= 30) {
      lifecycle = "dormant";
      transition = `No visit in ${daysSince(lastVisit)}d`;
    } else if (recent > prior && recent >= 2) {
      lifecycle = "active_growth";
      transition = "Visit cadence improving";
    } else if (prior > 0 && recent < prior * 0.7) {
      lifecycle = "declining";
      transition = "Visit frequency dropped";
    }

    labs.set(lid, {
      ...base,
      lifecycle,
      transition,
      recentVisits: recent,
      lastVisit: lastVisit || "—",
      stage: stage || "—",
    });
  }

  const priorityLifecycle = new Set([
    "declining",
    "collections_risk",
    "dormant",
    "onboarding",
    "active_growth",
    "strategic_account",
  ]);

  return [...labs.values()]
    .filter((l) => priorityLifecycle.has(l.lifecycle))
    .sort((a, b) => b.overdueDays - a.overdueDays || b.outstanding - a.outstanding)
    .slice(0, MAX_LABS);
}

/**
 * 4. Intervention escalation intelligence
 */
export function buildInterventionEscalationInsights(tenantId, interventionQueues = {}) {
  const insights = [];
  const records = loadInterventionRecords(tenantId);
  const issues = interventionQueues.allIssues || [];

  for (const issue of issues) {
    const rec = records[issue.id];
    if (!rec) continue;
    const reopenCount = (rec.history || []).filter((h) => h.action === "reopen").length;
    const assignChanges = (rec.history || []).filter(
      (h) => h.action === "assign_owner" || h.action === "escalate"
    ).length;
    const proofRequests = (rec.history || []).filter((h) => h.action === "require_proof").length;
    const ageDays = issue.ageDays || 0;
    const unresolved = issue.workflowState !== "RESOLVED" && ageDays >= 14;

    if (reopenCount >= 2) {
      insights.push({
        id: `insight-reopen-${issue.id}`,
        kind: "executive_escalation",
        title: "Executive escalation needed",
        subtitle: issue.title,
        labId: issue.labId,
        severity: "CRITICAL",
        summary: `Reopened ${reopenCount} times without stable closure`,
        recommendedAction: "Assign single owner and advance qualification pipeline",
      });
    } else if (unresolved) {
      insights.push({
        id: `insight-sla-${issue.id}`,
        kind: "sla_breach",
        title: "Unresolved past SLA",
        subtitle: issue.subtitle || issue.labName,
        labId: issue.labId,
        severity: "ATTENTION",
        summary: `${ageDays}d open · state ${rec.state}`,
        recommendedAction: "Close or escalate with proof of resolution",
      });
    } else if (assignChanges >= 3) {
      insights.push({
        id: `insight-bounce-${issue.id}`,
        kind: "operational_bottleneck",
        title: "Operational bottleneck",
        subtitle: issue.title,
        labId: issue.labId,
        severity: "ATTENTION",
        summary: "Intervention bouncing between owners",
        recommendedAction: "Lock single accountable owner",
      });
    } else if (proofRequests >= 2) {
      insights.push({
        id: `insight-proof-loop-${issue.id}`,
        kind: "execution_degrading",
        title: "Field execution degrading",
        subtitle: issue.labName || issue.subtitle,
        labId: issue.labId,
        severity: "ATTENTION",
        summary: "Proof requested repeatedly",
        recommendedAction: "Visit with mandatory proof capture",
      });
    }
  }

  const openLoops = issues.filter(
    (i) =>
      i.workflowState !== "RESOLVED" &&
      (i.interventionRecord?.history || []).length >= 4 &&
      daysSince(i.interventionRecord?.createdAt) >= 10
  );
  if (openLoops.length >= 2) {
    insights.push({
      id: "insight-open-loops",
      kind: "operational_loop",
      title: "Operational loops without closure",
      subtitle: `${openLoops.length} long-running interventions`,
      severity: "ATTENTION",
      summary: "Multiple state changes without resolution",
      recommendedAction: "Executive intervention workshop on top cases",
    });
  }

  insights.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  return insights.slice(0, MAX_ESCALATION_INSIGHTS);
}

/**
 * 5. Executive trend strips (7d vs prior 7d)
 */
export function buildExecutiveTrendStrips(payload, tenantId = "") {
  const visits = payload.visits || [];
  const evidence = payload.evidence || [];
  const collections = payload.collections || [];
  const qualifications = payload.qualifications || [];

  const visitsRecent = countVisitsInWindow(visits, 0, 7);
  const visitsPrior = countVisitsInWindow(visits, 7, 14);

  const proofsRecent = evidence.filter((e) => inDays(e.uploadedAt, 0, 7)).length;
  const proofsPrior = evidence.filter((e) => inDays(e.uploadedAt, 7, 14)).length;

  const collExposure = collections.reduce((s, c) => s + Number(c.outstandingAmount || 0), 0);
  const overdueRecent = collections.filter((c) => Number(c.overdueDays) >= 7).length;
  const overduePrior = collections.filter((c) => Number(c.overdueDays) >= 14).length;

  const onboardingRecent = qualifications.filter((q) => {
    const s = str(q.stage).toLowerCase();
    return s.includes("new") || s.includes("onboard");
  }).length;

  const ledger = tenantId ? readOperationalLedger(tenantId).slice(0, 80) : [];
  const pressureRecent = ledger.filter((e) =>
    inDays(e.event_timestamp || e.timestamp, 0, 7)
  ).length;
  const pressurePrior = ledger.filter((e) =>
    inDays(e.event_timestamp || e.timestamp, 7, 14)
  ).length;

  const strip = (key, label, current, previous, higherIsBetter, formatter = (n) => String(n)) => {
    const t = trendSignal(current, previous, higherIsBetter);
    return { key, label, value: formatter(current), ...t };
  };

  return [
    strip("collections", "Collections pressure", overdueRecent, overduePrior, false),
    strip("field", "Field activity", visitsRecent, visitsPrior, true),
    strip("onboarding", "Onboarding pipeline", onboardingRecent, Math.max(1, onboardingRecent), true),
    strip("proof", "Proof compliance", proofsRecent, proofsPrior, true),
    strip("pressure", "Operational pressure", pressureRecent, pressurePrior, false),
  ];
}

/**
 * 6. Operational reliability layer
 */
export function buildOperationalReliabilityScores({
  driftSignals = [],
  agents = [],
  interventionQueues = {},
  trendStrips = [],
}) {
  const activeDrift = driftSignals.filter((d) => d.trend === "worsening").length;
  const atRiskAgents = agents.filter((a) => a.atRisk).length;
  const openIssues = (interventionQueues.allIssues || []).filter(
    (i) => i.workflowState !== "RESOLVED"
  ).length;
  const resolved = interventionQueues.resolvedCount || 0;

  const fieldDiscipline = clampScore(
    100 - atRiskAgents * 12 - driftSignals.filter((d) => d.type === "visit_frequency").length * 5
  );
  const collectionsDiscipline = clampScore(
    100 -
      driftSignals.filter((d) => d.type === "collections").length * 15 -
      (trendStrips.find((t) => t.key === "collections")?.trend === "worsening" ? 10 : 0)
  );
  const executionReliability = clampScore(
    agents.length > 0
      ? agents.reduce((s, a) => s + a.reliabilityScore, 0) / agents.length
      : null
  );
  const closureHealth = clampScore(
    resolved > 0 ? 75 : 60 - Math.min(30, openIssues * 2)
  );

  const overall = clampScore(
    (executionReliability ?? fieldDiscipline) * 0.3 +
      collectionsDiscipline * 0.25 +
      fieldDiscipline * 0.25 +
      closureHealth * 0.2 -
      activeDrift * 2
  );

  return {
    overall: agents.length === 0 && activeDrift === 0 ? null : overall,
    executionReliability: executionReliability ?? null,
    collectionsDiscipline,
    fieldDiscipline,
    interventionClosureHealth: closureHealth,
    activeDriftCount: activeDrift,
    atRiskAgentCount: atRiskAgents,
  };
}

/**
 * Full intelligence model for Executive Control Tower.
 */
export function buildExecutiveIntelligenceModel({
  payload,
  opsModel,
  tenantId = "",
  interventionQueues = {},
}) {
  const taskModel = buildExecutiveOperationalTaskModel(interventionQueues, tenantId, payload);

  const driftSignals = buildOperationalDriftSignals(payload, opsModel);
  const agents = buildAgentQualityIntelligence(payload, taskModel);
  const labLifecycle = buildLabLifecycleIntelligence(payload);
  const escalationInsights = buildInterventionEscalationInsights(tenantId, interventionQueues);
  const trendStrips = buildExecutiveTrendStrips(payload, tenantId);
  const reliability = buildOperationalReliabilityScores({
    driftSignals,
    agents,
    interventionQueues,
    trendStrips,
  });

  return {
    driftSignals,
    agents,
    labLifecycle,
    escalationInsights,
    trendStrips,
    reliability,
  };
}
