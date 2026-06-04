import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { filterVisitProofEvidence } from "@/utils/operationalEvidenceUi.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import { buildExecutiveIntelligenceModel } from "@/operations/executiveIntelligenceModel.js";
import { buildExecutiveOperationalTaskModel } from "@/operations/operationalTaskModel.js";
import { readOperationalLedger } from "@/operations/operationalEventLedger.js";
import { buildUnifiedOperationsFeedRows } from "@/operations/operationalEventTimeline.js";
import { labIdKey } from "@/utils/labId.js";

const PILOT_READINESS_TARGET = 90;

function str(v) {
  return String(v ?? "").trim();
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function inDays(iso, minDay, maxDay) {
  const s = str(iso).slice(0, 10);
  if (!s) return false;
  const age = Math.floor((Date.now() - Date.parse(s)) / 86400000);
  return age >= minDay && age < maxDay;
}

function fulfilledOrder(o) {
  const s = str(o.orderStatus).toLowerCase();
  return s.includes("fulfill") || s.includes("delivered");
}

/**
 * Deterministic operational signals for founder phase engine.
 * @param {object} payload
 * @param {string} tenantId
 */
export function computeFounderOperationalSignals(payload = {}, tenantId = "") {
  const collections = payload.collections || [];
  const visits = payload.visits || [];
  const orders = payload.orders || [];
  const evidence = payload.evidence || [];
  const qualifications = payload.qualifications || [];

  const collSummary = summarizeCollectionsList(collections);
  const overdueLabs = collections.filter((c) => Number(c.overdueDays) > 0).length;
  const collectionsHealth = clamp(
    collections.length === 0
      ? 0
      : 100 - (overdueLabs / collections.length) * 100
  );

  const labIds = new Set();
  for (const c of collections) {
    const lid = labIdKey(c.labId);
    if (lid) labIds.add(lid);
  }
  for (const v of visits) {
    const lid = labIdKey(v.labId || v.lab_id);
    if (lid) labIds.add(lid);
  }

  const visits14d = visits.filter((v) => inDays(v.visitDate || v.date, 0, 14)).length;
  const recentVisits = visits.slice(0, 40);
  let proofRequired = 0;
  let proofLinked = 0;
  for (const v of recentVisits) {
    proofRequired += 1;
    const vid = str(v.visitId || v.id);
    if (vid && filterVisitProofEvidence(evidence, vid).length) proofLinked += 1;
  }
  const proofCompliancePct =
    proofRequired > 0 ? clamp((proofLinked / proofRequired) * 100) : 0;

  const fulfilled = orders.filter(fulfilledOrder).length;
  const orderFulfillmentPct =
    orders.length > 0 ? clamp((fulfilled / orders.length) * 100) : 0;

  const localOnly = evidence.filter((e) => e.storageBackend === "local_embedded").length;
  const evidencePass =
    evidence.length === 0 || localOnly <= Math.ceil(evidence.length * 0.5);
  const evidenceScore = evidence.length === 0 ? 50 : evidencePass ? 100 : 30;

  const collectionTenantIds = collections
    .map((c) => str(c.tenantId || c.tenant_id))
    .filter(Boolean);
  const tenantIsolationPass =
    !tenantId ||
    collectionTenantIds.length === 0 ||
    collectionTenantIds.every((t) => t === str(tenantId));

  const dataStale =
    !payload.dashboard &&
    collections.length === 0 &&
    visits.length === 0 &&
    orders.length === 0;

  let execModel = null;
  let intelligence = null;
  let overdueInterventions = 0;
  let missingProofDrift = 0;
  let feedDupes = 0;
  let taskLinkageOk = true;

  if (tenantId && !dataStale) {
    try {
      execModel = buildExecutiveInterventionModel(payload, { tenantId });
      const queues = execModel.interventionQueues || {};
      intelligence = buildExecutiveIntelligenceModel({
        payload,
        opsModel: execModel,
        tenantId,
        interventionQueues: queues,
      });
      overdueInterventions = (queues.allIssues || []).filter(
        (i) =>
          i.workflowState !== "RESOLVED" &&
          ((i.ageDays || 0) >= 7 || (i.displaySeverity || i.severity) === "CRITICAL")
      ).length;
      missingProofDrift = (intelligence.driftSignals || []).filter(
        (d) => d.type === "missing_proof"
      ).length;

      const taskModel = buildExecutiveOperationalTaskModel(queues, tenantId, payload);
      const linked = (taskModel.allTasks || []).filter((t) => t.linkedInterventionId);
      taskLinkageOk =
        linked.length > 0 || (queues.allIssues || []).length === 0;

      const feed = buildUnifiedOperationsFeedRows({
        tenantId,
        opsFeed: execModel.feed || [],
        payload,
        limit: 28,
      });
      const ids = new Set();
      for (const row of feed) {
        if (ids.has(row.id)) feedDupes += 1;
        ids.add(row.id);
      }
    } catch {
      execModel = null;
    }
  }

  const closureHealth = intelligence?.reliability?.interventionClosureHealth ?? 50;
  const fieldActivityScore = clamp(visits14d * 15);
  const dataPresentScore = dataStale ? 0 : 100;
  const integrityScore = clamp(
    100 - feedDupes * 15 - (taskLinkageOk ? 0 : 25)
  );

  const componentScores = {
    dataPresent: dataPresentScore,
    collectionsHealth,
    proofCompliance: proofCompliancePct,
    evidenceStorage: evidenceScore,
    fieldActivity: fieldActivityScore,
    orderFulfillment: orderFulfillmentPct,
    interventionClosure: closureHealth,
    integrity: integrityScore,
  };

  const weights = {
    dataPresent: 10,
    collectionsHealth: 15,
    proofCompliance: 20,
    evidenceStorage: 15,
    fieldActivity: 10,
    orderFulfillment: 10,
    interventionClosure: 10,
    integrity: 10,
  };

  let weightSum = 0;
  let weighted = 0;
  for (const [key, score] of Object.entries(componentScores)) {
    const w = weights[key] || 0;
    weightSum += w;
    weighted += score * w;
  }
  const pilotReadinessPct = weightSum > 0 ? clamp(weighted / weightSum) : 0;

  const e2eSimulationPass =
    collections.length > 0 && visits.length > 0 && orders.length > 0;
  const agentWorkflowPass = visits14d >= 1;
  const labOrderingPass = orders.length > 0;

  const unlockGates = [
    {
      id: "pilot_readiness_90",
      label: "Pilot Readiness ≥ 90%",
      pass: pilotReadinessPct >= PILOT_READINESS_TARGET,
      current: pilotReadinessPct,
      target: PILOT_READINESS_TARGET,
    },
    {
      id: "tenant_isolation",
      label: "Tenant isolation PASS",
      pass: tenantIsolationPass,
      current: tenantIsolationPass ? 100 : 0,
      target: 100,
    },
    {
      id: "evidence_storage",
      label: "Evidence storage PASS",
      pass: evidencePass,
      current: evidenceScore,
      target: 100,
    },
    {
      id: "e2e_simulation",
      label: "End-to-end data present",
      pass: e2eSimulationPass,
      current: e2eSimulationPass ? 100 : 0,
      target: 100,
    },
    {
      id: "agent_workflow",
      label: "Agent workflow active (14d visits)",
      pass: agentWorkflowPass,
      current: visits14d,
      target: 1,
    },
    {
      id: "lab_ordering",
      label: "Lab ordering flow active",
      pass: labOrderingPass,
      current: orders.length,
      target: 1,
    },
  ];

  const fieldScaleUnlocked = unlockGates.every((g) => g.pass);

  return {
    tenantId,
    dataStale,
    feedDupes,
    taskLinkageOk,
    activeLabs: labIds.size,
    completedOrders: fulfilled,
    openOrders: orders.length - fulfilled,
    totalOrders: orders.length,
    collectionsHealth,
    overdueLabs,
    totalCollections: collections.length,
    visitsLogged: visits.length,
    visits14d,
    proofCompliancePct,
    pilotReadinessPct,
    pilotReadinessTarget: PILOT_READINESS_TARGET,
    pilotReadinessGap: Math.max(0, PILOT_READINESS_TARGET - pilotReadinessPct),
    componentScores,
    unlockGates,
    fieldScaleUnlocked,
    overdueInterventions,
    missingProofDrift,
    qualificationsPending: qualifications.filter((q) => {
      const r = str(q.founderReviewStatus || q.founder_review_status).toLowerCase();
      return r === "pending" || r === "needs_info";
    }).length,
    ledgerEvents: tenantId ? readOperationalLedger(tenantId).length : 0,
    localEvidenceCount: localOnly,
    execModel,
    intelligence,
  };
}

export { PILOT_READINESS_TARGET };
