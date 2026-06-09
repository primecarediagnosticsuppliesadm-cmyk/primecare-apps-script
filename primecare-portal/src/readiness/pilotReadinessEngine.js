import { readDistributorCatalogItems, isCatalogAssigned } from "@/catalog/distributorCatalogEngine.js";
import { CATALOG_SYNC_STATUS } from "@/catalog/catalogMirrorHealth.js";
import {
  renewalRiskLevelFromDays,
  RENEWAL_RISK_LEVELS,
} from "@/contracts/contractRenewalIntelligenceEngine.js";
import {
  amountDueMatchesBreakdown,
  billingConfigWarnings,
  buildDistributorBillingRow,
} from "@/distributor/distributorBillingEngine.js";
import {
  collectDistributorLabIds,
  detectHqLeakage,
  filterContractsByDistributor,
  filterRowsByTenant,
} from "@/distributor/distributorOsEngine.js";
import {
  canDistributorOperate,
  enrichRegistryRowLifecycle,
  LIFECYCLE_STATUS,
  lifecycleStatusLabel,
  resolveDistributorLifecycleStatus,
} from "@/distributor/distributorLifecycleEngine.js";
import { computeDistributorMetrics } from "@/distributor/distributorOsPortfolioEngine.js";
import { loadFounderFinancialIntelligenceData } from "@/founder/founderFinancialIntelligenceData.js";
import { buildFounderFinancialIntelligenceModel } from "@/founder/founderFinancialIntelligenceEngine.js";
import {
  buildDistributorProfitabilityModel,
  CONTRIBUTION_STATUS,
  findProfitabilityRow,
} from "@/founder/distributorProfitabilityEngine.js";
import { computeFounderOperationalSignals } from "@/founder/founderPilotReadinessCompute.js";
import { buildLabContractModel } from "@/labContract/labContractEngine.js";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { buildQAReadinessModel } from "@/qa/qaReadinessEngine.js";
import { loadQaDefects } from "@/qa/qaDefectRegistry.js";
import { PERSISTENCE_STATUS } from "@/tenant/durableTenantStore.js";
import { labIdKey } from "@/utils/labId.js";
import {
  isQualificationPipelineReady,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";

export const READINESS_BAND = {
  READY: "READY FOR PILOT",
  CONDITIONAL: "CONDITIONAL GO",
  NOT_READY: "NOT READY",
  BLOCKED: "BLOCKED",
};

export const GATE_IDS = {
  FOUNDATION: "foundation",
  CATALOG: "catalog",
  LABS: "labs",
  CONTRACTS: "contracts",
  BILLING: "billing",
  COLLECTIONS: "collections",
  FINANCIAL: "financial",
  OPERATIONS: "operations",
  QUALITY: "quality",
};

export const PILOT_READINESS_GATES = [
  { id: GATE_IDS.FOUNDATION, label: "Distributor Foundation" },
  { id: GATE_IDS.CATALOG, label: "Catalog Readiness" },
  { id: GATE_IDS.LABS, label: "Lab Readiness" },
  { id: GATE_IDS.CONTRACTS, label: "Contract Readiness" },
  { id: GATE_IDS.BILLING, label: "Billing Readiness" },
  { id: GATE_IDS.COLLECTIONS, label: "Collections Readiness" },
  { id: GATE_IDS.FINANCIAL, label: "Financial Readiness" },
  { id: GATE_IDS.OPERATIONS, label: "Operational Readiness" },
  { id: GATE_IDS.QUALITY, label: "Quality Readiness" },
];

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function readinessBandFromScore(score) {
  const s = clamp(score);
  if (s >= 90) return READINESS_BAND.READY;
  if (s >= 75) return READINESS_BAND.CONDITIONAL;
  if (s >= 60) return READINESS_BAND.NOT_READY;
  return READINESS_BAND.BLOCKED;
}

export function aggregateGateStatus(checks = []) {
  const statuses = checks.map((c) => c.status);
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("WARN")) return "WARN";
  return "PASS";
}

export function gateScoreFromStatus(status) {
  if (status === "PASS") return 100;
  if (status === "WARN") return 60;
  return 0;
}

export function scoreFromGateStatuses(gates = []) {
  if (!gates.length) return 0;
  const total = gates.reduce((sum, gate) => sum + gateScoreFromStatus(gate.status), 0);
  return clamp(total / gates.length);
}

function makeCheck(id, label, status, detail = "") {
  return { id, label, status, detail };
}

function isTenantDurable(row = {}) {
  if (row.durable === true) return true;
  const status = str(row.persistenceStatus);
  return status === PERSISTENCE_STATUS.DURABLE;
}

function isQualifiedLab(qualification = {}) {
  return isQualificationPipelineReady(qualification);
}

function qualificationsForDistributor(qualifications = [], distributorId, labIds = new Set()) {
  const target = str(distributorId);
  return qualifications.filter((q) => {
    const tenant = str(q.tenantId || q.tenant_id);
    const lab = labIdKey(q.labId || q.lab_id);
    return tenant === target || (lab && labIds.has(lab));
  });
}

function catalogMirrorForDistributor(catalogMirrorSummary, distributorId) {
  return (catalogMirrorSummary?.rows || []).find((r) => r.distributorId === distributorId) || null;
}

function evaluateFoundationGate(distributor, context) {
  const enriched = enrichRegistryRowLifecycle(distributor);
  const checks = [
    makeCheck("exists", "Distributor exists", "PASS", enriched.name || enriched.id),
    makeCheck(
      "active",
      "Distributor active",
      enriched.lifecycleStatus === LIFECYCLE_STATUS.ACTIVE && enriched.canOperate ? "PASS" : "FAIL",
      lifecycleStatusLabel(enriched.lifecycleStatus)
    ),
    makeCheck(
      "durable",
      "Tenant durable",
      isTenantDurable(enriched) ? "PASS" : enriched.persistenceStatus === PERSISTENCE_STATUS.SYNC_FAILED ? "FAIL" : "WARN",
      enriched.persistenceStatus || "unknown"
    ),
  ];

  const { labs, orders, collections, homeTenantId } = context;
  const scopedLabs = filterRowsByTenant(labs, enriched.id);
  const scopedOrders = filterRowsByTenant(orders, enriched.id);
  const scopedCollections = filterRowsByTenant(collections, enriched.id);
  const labLeak = detectHqLeakage(scopedLabs, enriched.id, homeTenantId);
  const orderLeak = detectHqLeakage(scopedOrders, enriched.id, homeTenantId);
  const collLeak = detectHqLeakage(scopedCollections, enriched.id, homeTenantId);
  const leakCount = labLeak.homeCount + orderLeak.homeCount + collLeak.homeCount;
  checks.push(
    makeCheck(
      "isolation",
      "Tenant isolation passing",
      leakCount === 0 ? "PASS" : "FAIL",
      leakCount ? `${leakCount} HQ row leak(s)` : "No leakage"
    )
  );

  return { id: GATE_IDS.FOUNDATION, label: "Distributor Foundation", checks, status: aggregateGateStatus(checks) };
}

function evaluateCatalogGate(distributor, catalogMirrorSummary) {
  const config = distributor.config || {};
  const items = readDistributorCatalogItems(config);
  const mirror = catalogMirrorForDistributor(catalogMirrorSummary, distributor.id);
  const checks = [
    makeCheck(
      "assigned",
      "Catalog assigned",
      isCatalogAssigned(config) || items.length > 0 ? "PASS" : "FAIL",
      `${items.length} item(s)`
    ),
    makeCheck(
      "saved",
      "Catalog saved",
      items.length > 0 ? "PASS" : "FAIL",
      items.some((i) => i.assignedAt) ? "Assigned timestamps present" : items.length ? "Items in metadata" : "No items"
    ),
    makeCheck(
      "mirror",
      "Catalog mirror health not Sync Failed",
      !mirror
        ? items.length > 0
          ? "WARN"
          : "FAIL"
        : mirror.status === CATALOG_SYNC_STATUS.SYNC_FAILED
          ? "FAIL"
          : "PASS",
      mirror?.status || "No mirror diagnostics"
    ),
  ];
  return { id: GATE_IDS.CATALOG, label: "Catalog Readiness", checks, status: aggregateGateStatus(checks) };
}

function evaluateLabsGate(distributor, metrics, qualifications = []) {
  const labIds = collectDistributorLabIds(metrics.labsRows || [], distributor.id);
  const scopedQuals = qualificationsForDistributor(qualifications, distributor.id, labIds);
  const qualifiedCount = scopedQuals.filter(isQualifiedLab).length;
  const pendingOnboarding = scopedQuals.filter((q) => {
    const stage = normalizeQualificationPipelineStage(q.pipelineStage || q.pipeline_stage);
    return stage && !isQualificationPipelineReady(q) && stage !== "lost";
  }).length;

  const checks = [
    makeCheck(
      "first_lab",
      "First lab exists",
      num(metrics.labs) > 0 ? "PASS" : "FAIL",
      `${num(metrics.labs)} lab(s)`
    ),
    makeCheck(
      "qualified_lab",
      "At least one qualified lab",
      qualifiedCount > 0 ? "PASS" : num(metrics.labs) > 0 ? "WARN" : "FAIL",
      `${qualifiedCount} qualified`
    ),
    makeCheck(
      "onboarding",
      "Lab onboarding healthy",
      pendingOnboarding === 0 ? "PASS" : pendingOnboarding <= 2 ? "WARN" : "FAIL",
      pendingOnboarding ? `${pendingOnboarding} pending review` : "No blocking reviews"
    ),
  ];
  return { id: GATE_IDS.LABS, label: "Lab Readiness", checks, status: aggregateGateStatus(checks) };
}

function evaluateContractsGate(
  distributor,
  contracts = [],
  renewalRow = null,
  qualifications = [],
  metrics = {}
) {
  const scoped = filterContractsByDistributor(contracts, distributor.id);
  const activeCount = scoped.filter((c) => str(c.status) === CONTRACT_STATUSES.ACTIVE).length;
  const labIds = collectDistributorLabIds(metrics.labsRows || [], distributor.id);
  const scopedQuals = qualificationsForDistributor(qualifications, distributor.id, labIds);
  const qualifiedCount = scopedQuals.filter(isQualifiedLab).length;
  const criticalExpiry = scoped.some(
    (c) =>
      str(c.status) === CONTRACT_STATUSES.ACTIVE &&
      renewalRiskLevelFromDays(c.daysToExpiry) === RENEWAL_RISK_LEVELS.CRITICAL
  );

  const checks = [
    makeCheck(
      "active_contract",
      "Active contract exists",
      activeCount > 0 ? "PASS" : "FAIL",
      `${activeCount} active`
    ),
    makeCheck(
      "expiry_risk",
      "No critical contract expiry risk",
      criticalExpiry ? "FAIL" : renewalRow?.expiringContracts > 0 ? "WARN" : "PASS",
      renewalRow?.expiringContracts
        ? `${renewalRow.expiringContracts} expiring within 90d`
        : "No expiring contracts"
    ),
    makeCheck(
      "qualification_alignment",
      "Active contracts backed by qualified pipeline labs",
      activeCount > qualifiedCount ? "WARN" : "PASS",
      activeCount > qualifiedCount
        ? `${activeCount} active contract(s) vs ${qualifiedCount} qualified lab(s)`
        : activeCount
          ? `${activeCount} active, ${qualifiedCount} qualified`
          : "No active contracts"
    ),
  ];
  return { id: GATE_IDS.CONTRACTS, label: "Contract Readiness", checks, status: aggregateGateStatus(checks) };
}

function evaluateBillingGate(distributor, billingRow = null, metrics = {}) {
  const config = distributor.config || {};
  const model = str(config.billingModel);
  const warnings = billingConfigWarnings(model, config);
  const billing = billingRow || buildDistributorBillingRow(distributor, metrics);
  const mathOk = amountDueMatchesBreakdown(billing);

  const checks = [
    makeCheck(
      "configured",
      "Billing model configured",
      model && warnings.length === 0 ? "PASS" : model ? "WARN" : "FAIL",
      warnings.length ? warnings.join(", ") : model || "No billing model"
    ),
    makeCheck(
      "calculations",
      "Billing calculations passing",
      mathOk ? "PASS" : "FAIL",
      mathOk ? "Amount due matches breakdown" : "Billing math mismatch"
    ),
  ];
  return { id: GATE_IDS.BILLING, label: "Billing Readiness", checks, status: aggregateGateStatus(checks) };
}

function evaluateCollectionsGate(metrics, recoveryPct = null) {
  const checks = [
    makeCheck(
      "healthy",
      "Collections module healthy",
      num(metrics.collections) > 0 ? "PASS" : "WARN",
      `${num(metrics.collections)} AR row(s)`
    ),
    makeCheck(
      "recovery",
      "Recovery metrics available",
      recoveryPct != null || num(metrics.collectionsTotal) > 0 ? "PASS" : "WARN",
      recoveryPct != null ? `${recoveryPct}% recovery` : "No recovery signal"
    ),
  ];
  return { id: GATE_IDS.COLLECTIONS, label: "Collections Readiness", checks, status: aggregateGateStatus(checks) };
}

function evaluateFinancialGate(fiModel, profitabilityRow = null) {
  const fiLoaded =
    fiModel?.loadStatus?.billing?.ok !== false &&
    fiModel?.loadStatus?.contracts?.ok !== false &&
    Boolean(fiModel?.hqSnapshot);
  const checks = [
    makeCheck(
      "fi_loaded",
      "Founder Financial Intelligence loaded",
      fiLoaded ? "PASS" : "FAIL",
      fiLoaded ? "HQ snapshot present" : "Financial intelligence incomplete"
    ),
    makeCheck(
      "profitability",
      "Distributor profitability available",
      profitabilityRow ? "PASS" : "WARN",
      profitabilityRow ? `Score ${profitabilityRow.contributionScore}` : "No profitability row"
    ),
    makeCheck(
      "risk",
      "No critical financial risk",
      profitabilityRow?.status === CONTRIBUTION_STATUS.AT_RISK ? "FAIL" : profitabilityRow?.status === CONTRIBUTION_STATUS.WATCH ? "WARN" : "PASS",
      profitabilityRow?.mainRiskDriver || "No elevated risk"
    ),
  ];
  return { id: GATE_IDS.FINANCIAL, label: "Financial Readiness", checks, status: aggregateGateStatus(checks) };
}

function evaluateOperationsGate(opsSignals = {}, opsPayload = {}) {
  const opsHealthy = Boolean(opsPayload?.dashboard) || num(opsPayload?.collections?.length) > 0;
  const intelligenceHealthy = Boolean(opsSignals.intelligence) && !opsSignals.dataStale;
  const ledgerHealthy = num(opsSignals.ledgerEvents) > 0;

  const checks = [
    makeCheck(
      "ops_center",
      "Operations Center healthy",
      opsHealthy ? "PASS" : "WARN",
      opsHealthy ? "Ops payload loaded" : "Limited ops data"
    ),
    makeCheck(
      "exec_intelligence",
      "Executive Intelligence healthy",
      intelligenceHealthy ? "PASS" : opsSignals.dataStale ? "WARN" : "FAIL",
      intelligenceHealthy ? "Intelligence model built" : "Intelligence unavailable"
    ),
    makeCheck(
      "event_ledger",
      "Event Ledger healthy",
      ledgerHealthy ? "PASS" : "WARN",
      `${num(opsSignals.ledgerEvents)} event(s)`
    ),
  ];
  return { id: GATE_IDS.OPERATIONS, label: "Operational Readiness", checks, status: aggregateGateStatus(checks) };
}

function evaluateQualityGate(qaModel = {}) {
  const qaScore = num(qaModel.readinessScore);
  const predator = qaModel.predatorHealth || {};
  const predatorOk = num(predator.fail) === 0;
  const criticalDefects = num(qaModel.defects?.critical);

  const checks = [
    makeCheck(
      "qa_score",
      "QA Command Center >= Pilot Ready",
      qaScore >= 75 ? "PASS" : qaScore >= 60 ? "WARN" : "FAIL",
      `${qaScore} · ${qaModel.releaseStatus || "—"}`
    ),
    makeCheck(
      "predator",
      "Predator health PASS or WARN",
      predatorOk ? "PASS" : "FAIL",
      predator.status || `${predator.fail} FAIL`
    ),
    makeCheck(
      "defects",
      "No active critical defects",
      criticalDefects === 0 ? "PASS" : "FAIL",
      `${criticalDefects} critical`
    ),
  ];
  return { id: GATE_IDS.QUALITY, label: "Quality Readiness", checks, status: aggregateGateStatus(checks) };
}

function collectBlockers(gates = []) {
  return gates.flatMap((gate) =>
    (gate.checks || [])
      .filter((c) => c.status === "FAIL")
      .map((c) => ({
        gateId: gate.id,
        gateLabel: gate.label,
        checkId: c.id,
        label: c.label,
        detail: c.detail,
      }))
  );
}

function buildNextActions(gates = [], distributors = []) {
  const actions = [];
  for (const gate of gates) {
    for (const check of gate.checks || []) {
      if (check.status === "PASS") continue;
      actions.push({
        priority: check.status === "FAIL" ? "high" : "medium",
        gateId: gate.id,
        gateLabel: gate.label,
        action: `${gate.label}: ${check.label}${check.detail ? ` — ${check.detail}` : ""}`,
      });
    }
  }

  const draftCount = distributors.filter(
    (d) => resolveDistributorLifecycleStatus(d) === LIFECYCLE_STATUS.DRAFT
  ).length;
  if (draftCount > 0) {
    actions.push({
      priority: "high",
      gateId: GATE_IDS.FOUNDATION,
      gateLabel: "Distributor Foundation",
      action: `Activate ${draftCount} draft distributor(s) before pilot launch`,
    });
  }

  return actions
    .sort((a, b) => (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1))
    .slice(0, 12);
}

/**
 * Load sources for Pilot Readiness Center (reuses existing intelligence loaders).
 */
export async function loadPilotReadinessData(currentUser, options = {}) {
  const fiData = await loadFounderFinancialIntelligenceData(currentUser, options);
  const predatorReports = predatorStore.getModuleReportsForActiveTenant();
  const defects = loadQaDefects();
  const qaModel = buildQAReadinessModel({ predatorReports, defects });
  return {
    ...fiData,
    qaModel,
    predatorReports,
    defects,
    qualifications: fiData.opsPayload?.qualifications || [],
  };
}

/**
 * Build portfolio + per-distributor pilot readiness model.
 */
export function buildPilotReadinessModel(data = {}) {
  const homeTenantId = str(data.homeTenantId);
  const distributors = data.distributors || [];
  const portfolio = data.portfolio || {};
  const opsPayload = data.opsPayload || {};
  const contracts = data.contracts || [];
  const qaModel = data.qaModel || buildQAReadinessModel();
  const catalogMirrorSummary = data.catalogMirrorSummary || {};
  const qualifications = data.qualifications || opsPayload.qualifications || [];

  const labs = portfolio.raw?.labs || opsPayload.labs || [];
  const orders = portfolio.raw?.orders || opsPayload.orders || [];
  const collections = portfolio.raw?.collections || opsPayload.collections || [];

  const fiModel = buildFounderFinancialIntelligenceModel(data);
  const opsSignals = computeFounderOperationalSignals(opsPayload, homeTenantId);
  const operationsGate = evaluateOperationsGate(opsSignals, opsPayload);
  const qualityGate = evaluateQualityGate(qaModel);

  const distributorIds = new Set([homeTenantId, ...distributors.map((d) => d.id)].filter(Boolean));
  const contractModel = buildLabContractModel(contracts, opsPayload, distributorIds);
  const renewalById = new Map(
    (fiModel.contractRenewal?.distributorRenewalHealth || []).map((r) => [r.distributorId, r])
  );
  const profitabilityModel = buildDistributorProfitabilityModel({
    distributors,
    performanceRows: portfolio.performanceRows || [],
    billingRows: portfolio.billingRows || [],
    commissionByDistributor: data.commissionRes?.byDistributor || {},
    contractRenewal: fiModel.contractRenewal,
    inventoryEconomics: fiModel.inventoryEconomics,
    collectionsRecoveryPct: fiModel.collectionsCash?.recoveryPct,
  });
  const billingById = new Map((portfolio.billingRows || []).map((r) => [r.distributorId, r]));
  const recoveryPct = fiModel.collectionsCash?.recoveryPct ?? null;

  const portfolioGates = [operationsGate, qualityGate];
  const distributorRows = distributors.map((distributor) => {
    const metrics = computeDistributorMetrics(distributor.id, { labs, orders, collections });
    const profitabilityRow = findProfitabilityRow(profitabilityModel, distributor.id);
    const renewalRow = renewalById.get(distributor.id) || null;
    const billingRow = billingById.get(distributor.id) || null;
    const enriched = enrichRegistryRowLifecycle(distributor);

    const gates = [
      evaluateFoundationGate(distributor, { labs, orders, collections, homeTenantId }),
      evaluateCatalogGate(distributor, catalogMirrorSummary),
      evaluateLabsGate(distributor, metrics, qualifications),
      evaluateContractsGate(
        distributor,
        contractModel.contracts || contracts,
        renewalRow,
        qualifications,
        metrics
      ),
      evaluateBillingGate(distributor, billingRow, metrics),
      evaluateCollectionsGate(metrics, recoveryPct),
      evaluateFinancialGate(fiModel, profitabilityRow),
      operationsGate,
      qualityGate,
    ];

    const score = scoreFromGateStatuses(gates);
    const band = readinessBandFromScore(score);
    const blockers = collectBlockers(gates);

    return {
      distributorId: distributor.id,
      name: distributor.name || distributor.id,
      status: enriched.lifecycleLabel,
      lifecycleStatus: enriched.lifecycleStatus,
      readinessScore: score,
      readinessBand: band,
      blockingIssues: blockers.map((b) => b.label),
      blockers,
      gates: {
        catalog: gates.find((g) => g.id === GATE_IDS.CATALOG)?.status || "FAIL",
        labs: gates.find((g) => g.id === GATE_IDS.LABS)?.status || "FAIL",
        contracts: gates.find((g) => g.id === GATE_IDS.CONTRACTS)?.status || "FAIL",
        billing: gates.find((g) => g.id === GATE_IDS.BILLING)?.status || "FAIL",
        collections: gates.find((g) => g.id === GATE_IDS.COLLECTIONS)?.status || "FAIL",
        financial: gates.find((g) => g.id === GATE_IDS.FINANCIAL)?.status || "FAIL",
        operations: operationsGate.status,
        qa: qualityGate.status,
      },
      gateDetails: gates,
    };
  });

  const gateBreakdown = PILOT_READINESS_GATES.map((def) => {
    const gateStatuses = distributorRows.map((row) => {
      if (def.id === GATE_IDS.OPERATIONS) return operationsGate.status;
      if (def.id === GATE_IDS.QUALITY) return qualityGate.status;
      return row.gateDetails.find((g) => g.id === def.id)?.status || "FAIL";
    });
    const failCount = gateStatuses.filter((s) => s === "FAIL").length;
    const warnCount = gateStatuses.filter((s) => s === "WARN").length;
    const passCount = gateStatuses.filter((s) => s === "PASS").length;
    const portfolioStatus =
      failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : passCount > 0 ? "PASS" : "FAIL";

    const checks =
      def.id === GATE_IDS.OPERATIONS
        ? operationsGate.checks
        : def.id === GATE_IDS.QUALITY
          ? qualityGate.checks
          : distributorRows[0]?.gateDetails.find((g) => g.id === def.id)?.checks || [];

    return {
      ...def,
      status: portfolioStatus,
      passCount,
      warnCount,
      failCount,
      distributorCount: distributors.length,
      checks,
    };
  });

  const overallScore =
    distributorRows.length > 0
      ? clamp(
          distributorRows.reduce((sum, row) => sum + num(row.readinessScore), 0) /
            distributorRows.length
        )
      : scoreFromGateStatuses(portfolioGates);

  const overallBand = readinessBandFromScore(overallScore);
  const blockers = [
    ...collectBlockers(portfolioGates),
    ...distributorRows.flatMap((row) =>
      row.blockers.map((b) => ({ ...b, distributorName: row.name }))
    ),
  ];

  return {
    overallScore,
    overallBand,
    readinessScore: overallScore,
    readinessBand: overallBand,
    gateBreakdown,
    distributors: distributorRows,
    blockers,
    nextActions: buildNextActions(gateBreakdown, distributors),
    trendPlaceholder: {
      label: "Readiness trend",
      message: "Historical readiness trend tracking is planned for a future release.",
      dataPoints: [],
    },
    qaReleaseStatus: qaModel.releaseStatus,
    qaReadinessScore: qaModel.readinessScore,
    predatorHealth: qaModel.predatorHealth,
    distributorCount: distributors.length,
    generatedAt: new Date().toISOString(),
    gates: gateBreakdown,
  };
}

export function validatePilotReadinessModelConsistency(model = {}) {
  const score = num(model.overallScore ?? model.readinessScore);
  const band = model.overallBand || model.readinessBand;
  const bandValid = band === readinessBandFromScore(score);

  const distributorScores = (model.distributors || []).map((d) => num(d.readinessScore));
  const rollupValid =
    distributorScores.length === 0 ||
    Math.abs(score - clamp(distributorScores.reduce((a, b) => a + b, 0) / distributorScores.length)) <= 1;

  const gatesLoaded =
    Array.isArray(model.gateBreakdown) &&
    model.gateBreakdown.length === PILOT_READINESS_GATES.length &&
    model.gateBreakdown.every((g) => ["PASS", "WARN", "FAIL"].includes(g.status));

  const blockersValid = Array.isArray(model.blockers);

  const scoreValid = score >= 0 && score <= 100 && bandValid;

  return {
    gatesLoaded,
    scoreValid,
    distributorRollupValid: rollupValid,
    blockersValid: Array.isArray(model.blockers),
    bandValid,
  };
}
