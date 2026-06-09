/**
 * Distributor Workspace V1
 *
 * Mapping: tenant_id === distributor company (legal business).
 * Territories/cities live on distributor.config.territories — never as separate tenants.
 */

import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { resolvePersistenceDisplay } from "@/tenant/durableTenantStore.js";
import { computeFounderOperationalSignals } from "@/founder/founderPilotReadinessCompute.js";
import { YEAR1_TARGETS } from "@/founder/founderStrategyTargets.js";
import { filterVisitProofEvidence } from "@/utils/operationalEvidenceUi.js";
import {
  getPipelineStageLabel,
  isQualificationPipelinePending,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";
import { labIdKey } from "@/utils/labId.js";
import { computeTenantHealthBand, computeTenantHealthScore } from "@/tenant/tenantFoundationEngine.js";
import { buildContractSummaryForDistributor } from "@/labContract/labContractEngine.js";
import { resolveDistributorLifecycleStatus } from "@/distributor/distributorLifecycleEngine.js";

const REVENUE_DAYS = YEAR1_TARGETS.revenueDaysPerMonth;

export const EMPTY_CONTRACT_SUMMARY = {
  activeContracts: 0,
  monthlyContractValue: 0,
  contractHealthScore: 0,
  contractHealthBand: "Healthy",
  expiryAlerts: [],
};

function safeContractList(contracts) {
  return Array.isArray(contracts) ? contracts : [];
}

const GROWTH_STAGES = [
  { id: "prospect", label: "Prospect" },
  { id: "qualified", label: "Qualified" },
  { id: "loi", label: "LOI / Interested" },
  { id: "onboarding", label: "Onboarding" },
  { id: "active", label: "Active" },
  { id: "dormant", label: "Dormant" },
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

function formatInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

function inDays(iso, maxDay) {
  const s = str(iso).slice(0, 10);
  if (!s) return false;
  const age = Math.floor((Date.now() - Date.parse(s)) / 86400000);
  return age >= 0 && age < maxDay;
}

/** @typedef {'pending'|'active'|'suspended'} DistributorStatus */

export function mapDistributorStatus(tenantStatus, tenant = null) {
  if (tenant) {
    const lifecycle = resolveDistributorLifecycleStatus(tenant);
    if (lifecycle === "active") return "active";
    if (lifecycle === "suspended") return "suspended";
    if (lifecycle === "deactivated") return "deactivated";
    if (lifecycle === "pending_launch") return "pending";
    if (lifecycle === "draft") return "draft";
  }
  const s = str(tenantStatus).toUpperCase();
  if (s === "ACTIVE") return "active";
  if (s === "SUSPENDED") return "suspended";
  if (s === "INACTIVE" || s === "DEACTIVATED") return "deactivated";
  return "pending";
}

/**
 * Territories are operational areas inside one distributor — not tenant ids.
 */
export function parseTerritorySummary(config = {}) {
  if (Array.isArray(config.territories) && config.territories.length) {
    return config.territories.map((t) => str(t)).filter(Boolean);
  }
  const parts = [str(config.state), str(config.country)].filter(Boolean);
  if (parts.length) return parts;
  return [];
}

export function territorySummaryLabel(config = {}) {
  const list = parseTerritorySummary(config);
  if (!list.length) return "Territory not set";
  if (list.length <= 2) return list.join(" · ");
  return `${list.slice(0, 2).join(" · ")} +${list.length - 2}`;
}

/**
 * Registry row from Tenant Foundation → distributor list entry.
 */
export function mapTenantToDistributorRegistryRow(tenant) {
  const config = tenant.config || {};
  const metrics = tenant.metrics || {};
  const territories = parseTerritorySummary(config);
  const persistence = resolvePersistenceDisplay(tenant);

  return {
    id: tenant.id,
    tenantId: tenant.id,
    name: tenant.name || config.displayName || config.companyName || "Distributor",
    status: mapDistributorStatus(tenant.status, tenant),
    lifecycleStatus: resolveDistributorLifecycleStatus(tenant),
    ownerAdmin: tenant.adminUser || config.adminName || "—",
    territorySummary: territorySummaryLabel(config),
    territories,
    labs: num(metrics.labs),
    agents: num(metrics.agents ?? config.agentCount ?? 0),
    orders: num(metrics.orders),
    collections: num(metrics.collections),
    outstanding: num(metrics.outstanding ?? config.outstanding),
    healthScore: tenant.healthScore ?? 0,
    healthBand: tenant.healthBand || "Watch",
    isHome: Boolean(tenant.isHome),
    source: tenant.source,
    config,
    registryOnly: tenant.source !== "database",
    createdAt: tenant.createdAt || null,
    persistenceStatus: persistence.key,
    persistenceLabel: tenant.persistenceLabel || persistence.label,
    persistenceTone: persistence.tone,
    durable: Boolean(tenant.durable || tenant.source === "database"),
    lastSyncError: tenant.lastSyncError || null,
  };
}

function mapQualToGrowthStage(qual, labCtx) {
  const stage = normalizeQualificationPipelineStage(
    qual.pipelineStage || qual.pipeline_stage || qual.stage
  );
  if (labCtx.dormant) return "dormant";
  if (labCtx.active) return "active";
  if (stage === "won") return labCtx.hasOrders ? "active" : "onboarding";
  if (stage === "qualified") return "qualified";
  if (["sample_sent", "negotiation", "reagent_rental_discussion"].includes(stage || "")) {
    return "loi";
  }
  if (["new", "contacted", "hold", null].includes(stage)) return "prospect";
  return "prospect";
}

function buildLabContexts(payload) {
  const collections = payload?.collections || [];
  const visits = payload?.visits || [];
  const orders = payload?.orders || [];
  const qualifications = payload?.qualifications || [];
  const evidence = payload?.evidence || [];
  const byLab = new Map();

  function ensure(lid, name) {
    if (!byLab.has(lid)) {
      byLab.set(lid, {
        labId: lid,
        labName: name || lid,
        outstanding: 0,
        revenue: 0,
        lastVisit: null,
        visitCount30d: 0,
        proofCount: 0,
        qualificationStage: "—",
        riskFlag: false,
        hasOrders: false,
        active: false,
        dormant: true,
      });
    }
    return byLab.get(lid);
  }

  for (const c of collections) {
    const lid = labIdKey(c.labId);
    if (!lid) continue;
    const row = ensure(lid, c.labName || c.lab_name);
    row.outstanding += num(c.outstandingAmount);
    if (num(c.overdueDays) > 0 || str(c.riskStatus).toLowerCase() === "high") {
      row.riskFlag = true;
    }
  }

  for (const v of visits) {
    const lid = labIdKey(v.labId || v.lab_id);
    if (!lid) continue;
    const row = ensure(lid, v.labName || v.lab_name);
    if (inDays(v.visitDate || v.date, 30)) {
      row.visitCount30d += 1;
      row.active = true;
      row.dormant = false;
    }
    const vd = str(v.visitDate || v.date);
    if (!row.lastVisit || vd > row.lastVisit) row.lastVisit = vd;
    const vid = str(v.visitId || v.id);
    if (vid && filterVisitProofEvidence(evidence, vid).length) {
      row.proofCount += 1;
    }
  }

  for (const o of orders) {
    const lid = labIdKey(o.labId || o.lab_id);
    if (!lid) continue;
    const row = ensure(lid, o.labName);
    row.hasOrders = true;
    row.revenue += num(o.orderValue || o.totalAmount || o.amount);
  }

  for (const q of qualifications) {
    const lid = labIdKey(q.labId || q.lab_id);
    if (!lid) continue;
    const row = ensure(lid, q.labName || q.lab_name);
    row.qualificationStage = getPipelineStageLabel(
      q.pipelineStage || q.pipeline_stage || q.stage
    );
  }

  return [...byLab.values()].sort((a, b) => b.outstanding - a.outstanding);
}

function buildGrowthPipeline(labs, qualifications, payload) {
  const counts = Object.fromEntries(GROWTH_STAGES.map((s) => [s.id, 0]));
  const labCtxById = new Map(labs.map((l) => [l.labId, l]));

  for (const qual of qualifications || []) {
    const lid = labIdKey(qual.labId || qual.lab_id);
    const ctx = labCtxById.get(lid) || { dormant: true, active: false, hasOrders: false };
    const stage = mapQualToGrowthStage(qual, ctx);
    counts[stage] = (counts[stage] || 0) + 1;
  }

  for (const lab of labs) {
    const hasQual = (qualifications || []).some(
      (q) => labIdKey(q.labId || q.lab_id) === lab.labId
    );
    if (!hasQual) {
      const stage = lab.dormant ? "dormant" : lab.active ? "active" : "prospect";
      counts[stage] = (counts[stage] || 0) + 1;
    }
  }

  if (!labs.length && !(qualifications || []).length && payload) {
    counts.prospect = 0;
  }

  return GROWTH_STAGES.map((s) => ({
    ...s,
    count: counts[s.id] || 0,
  }));
}

function buildTeamAgents(visits, profiles, signals) {
  const byAgent = new Map();

  for (const p of profiles || []) {
    const name = str(p.agent_name) || str(p.agentName) || "Agent";
    const key = str(p.user_id) || name;
    byAgent.set(key, {
      id: key,
      name,
      role: p.role,
      visits: 0,
      labsTouched: new Set(),
      collectionsLogged: 0,
      proofCompliancePct: 0,
      openInterventions: 0,
      activityStatus: p.active === false ? "Inactive" : "Active",
    });
  }

  for (const v of visits || []) {
    const name = str(v.agentName || v.agent_name || v.agent);
    if (!name) continue;
    const key = str(v.agentId || v.agent_id) || name;
    if (!byAgent.has(key)) {
      byAgent.set(key, {
        id: key,
        name,
        role: "agent",
        visits: 0,
        labsTouched: new Set(),
        collectionsLogged: 0,
        proofCompliancePct: 0,
        openInterventions: 0,
        activityStatus: "Active",
      });
    }
    const a = byAgent.get(key);
    a.visits += 1;
    const lid = labIdKey(v.labId || v.lab_id);
    if (lid) a.labsTouched.add(lid);
  }

  const agents = [...byAgent.values()].map((a) => ({
    ...a,
    labsTouched: a.labsTouched.size,
    proofCompliancePct: signals?.proofCompliancePct ?? 0,
    openInterventions: 0,
  }));

  return agents;
}

function buildRisks(ctx) {
  const risks = [];
  const h = ctx.health;

  if (h.outstandingReceivables > 0 && h.overdueCollections >= 2) {
    risks.push({
      id: "overdue_collections",
      title: "Overdue collections",
      detail: `${h.overdueCollections} accounts overdue · ${formatInr(h.outstandingReceivables)} outstanding`,
      action: "Review Credit & Risk queue",
      page: "risk",
      wired: true,
    });
  }
  if (h.inactiveLabs >= 1) {
    risks.push({
      id: "inactive_labs",
      title: "Inactive labs",
      detail: `${h.inactiveLabs} lab(s) without a visit in 30 days`,
      action: "Schedule field visits",
      page: "operationsCenter",
      wired: true,
    });
  }
  if (h.visits30d === 0 && ctx.isLive) {
    risks.push({
      id: "no_visits",
      title: "No recent visits",
      detail: "No agent visits logged in the last 30 days",
      action: "Open Operations Center",
      page: "operationsCenter",
      wired: true,
    });
  }
  if (h.proofCompliancePct < 80 && ctx.isLive) {
    risks.push({
      id: "missing_proof",
      title: "Missing visit proof",
      detail: `Proof compliance ${h.proofCompliancePct}% (target 80%)`,
      action: "Audit visit evidence",
      page: "operationsCenter",
      wired: true,
    });
  }
  if (h.staleQualifications >= 1) {
    risks.push({
      id: "stale_qualification",
      title: "Stale qualification pipeline",
      detail: `${h.staleQualifications} qualification(s) need review`,
      action: "Open Distributor OS → Labs → Qualification",
      page: "qualificationReview",
      wired: true,
    });
  }
  if (h.collectionEfficiencyPct < 50 && h.outstandingReceivables > 0) {
    risks.push({
      id: "low_collection_efficiency",
      title: "Low collection efficiency",
      detail: `Collection efficiency ${h.collectionEfficiencyPct}%`,
      action: "Prioritize collections",
      page: "risk",
      wired: true,
    });
  }
  if (h.agents === 0) {
    risks.push({
      id: "no_agents",
      title: "No agents assigned",
      detail: "No agents assigned yet.",
      action: "Assign agent",
      page: null,
      wired: false,
    });
  }
  if (h.activeLabs === 0 && ctx.isLive) {
    risks.push({
      id: "no_active_labs",
      title: "No active labs",
      detail: "No labs with recent field activity",
      action: "Add lab",
      page: null,
      wired: false,
    });
  }

  return risks.slice(0, 8);
}

function computeDistributorHealth(payload, registryMetrics, isLive) {
  if (!isLive) {
    const m = registryMetrics || {};
    return {
      monthlyRevenue: num(m.monthlyRevenue),
      collectionsReceived: num(m.collectionsReceived),
      outstandingReceivables: num(m.outstanding),
      collectionEfficiencyPct: num(m.collectionEfficiencyPct),
      activeLabs: num(m.labs),
      activeAgents: num(m.agents),
      visits30d: num(m.visits),
      proofCompliancePct: num(m.proofCompliancePct),
      openInterventions: num(m.openInterventions),
      overdueCollections: num(m.overdueCollections),
      inactiveLabs: 0,
      staleQualifications: 0,
      healthScore: clamp(num(m.healthScore)),
      healthBand: m.healthBand || "Watch",
      dataSource: "registry",
    };
  }

  const executive = payload?.dashboard?.executive || {};
  const collSummary = summarizeCollectionsList(payload?.collections || []);
  const signals = computeFounderOperationalSignals(payload, "");
  const labs = buildLabContexts(payload);
  const inactiveLabs = labs.filter((l) => !l.active).length;
  const qualifications = payload?.qualifications || [];
  const staleQualifications = qualifications.filter(isQualificationPipelinePending).length;

  const dailyRevenue = num(executive.todaysRevenue);
  const monthlyRevenue = dailyRevenue * REVENUE_DAYS;
  const collectionsReceived = num(
    payload?.dashboard?.summary?.todayCollections ?? collSummary.todayCollections
  );
  const outstandingReceivables = num(
    executive.outstandingReceivables ?? collSummary.totalOutstanding
  );
  const collectedPlusOutstanding = collectionsReceived + outstandingReceivables;
  const collectionEfficiencyPct =
    collectedPlusOutstanding > 0
      ? clamp((collectionsReceived / collectedPlusOutstanding) * 100)
      : collectionsReceived > 0
        ? 100
        : 0;

  const visits30d = (payload?.visits || []).filter((v) =>
    inDays(v.visitDate || v.date, 30)
  ).length;

  const metrics = {
    labs: labs.length,
    agents: 0,
    visits: visits30d,
    openInterventions: signals.overdueInterventions,
    isolationPass: true,
  };
  const healthBand = computeTenantHealthBand({
    ...metrics,
    openInterventions: signals.overdueInterventions,
  });
  const healthScore = computeTenantHealthScore(
    {
      ...metrics,
      proofCompliancePct: signals.proofCompliancePct,
      collectionsHealth: signals.collectionsHealth,
    },
    healthBand
  );

  return {
    monthlyRevenue,
    monthlyRevenueLabel: formatInr(monthlyRevenue),
    collectionsReceived,
    collectionsReceivedLabel: formatInr(collectionsReceived),
    outstandingReceivables,
    outstandingLabel: formatInr(outstandingReceivables),
    collectionEfficiencyPct,
    activeLabs: labs.filter((l) => l.active).length,
    activeAgents: 0,
    visits30d,
    proofCompliancePct: signals.proofCompliancePct,
    openInterventions: signals.overdueInterventions,
    overdueCollections: collSummary.overdueCount,
    inactiveLabs,
    staleQualifications,
    healthScore,
    healthBand,
    dataSource: "live",
  };
}

/**
 * Full workspace model for selected distributor.
 */
export function buildDistributorWorkspace({
  distributorRow,
  payload = null,
  agentProfiles = [],
  isLive = false,
  homeTenantId = "",
  contracts = [],
}) {
  const safeContracts = safeContractList(contracts);
  const config = distributorRow.config || {};
  const territories = parseTerritorySummary(config);

  const health = computeDistributorHealth(
    payload,
    {
      ...distributorRow,
      outstanding: distributorRow.outstanding,
      healthScore: distributorRow.healthScore,
      healthBand: distributorRow.healthBand,
    },
    isLive
  );

  const signals = isLive ? computeFounderOperationalSignals(payload, distributorRow.id) : null;
  const labs = isLive ? buildLabContexts(payload) : [];
  const team = isLive
    ? buildTeamAgents(payload?.visits || [], agentProfiles, signals)
    : [];
  health.activeAgents = team.length;

  const pipeline = isLive
    ? buildGrowthPipeline(labs, payload?.qualifications || [], payload)
    : GROWTH_STAGES.map((s) => ({ ...s, count: 0 }));

  const risks = buildRisks({
    health: { ...health, agents: team.length },
    isLive,
  });

  const profile = {
    id: distributorRow.id,
    tenantId: distributorRow.tenantId,
    name: distributorRow.name,
    legalName: str(config.legalName) || str(config.companyName),
    ownerAdmin: distributorRow.ownerAdmin,
    email: str(config.adminEmail),
    phone: str(config.adminPhone),
    status: distributorRow.status,
    agreementDate: str(config.agreementDate) || null,
    territories,
    territorySummary: distributorRow.territorySummary,
    commissionPct: num(config.commissionPct ?? config.commission_pct) || null,
    creditLimit: num(config.creditLimit ?? config.credit_limit) || null,
    paymentTerms: str(config.collectionsRules) || str(config.paymentTerms) || "—",
    createdAt: distributorRow.createdAt || null,
    isHome: distributorRow.isHome,
    registryOnly: distributorRow.registryOnly,
  };

  const canNavigateOps = isLive && !distributorRow.registryOnly;

  const contractSummary = isLive
    ? buildContractSummaryForDistributor(distributorRow.id, safeContracts, payload)
    : { ...EMPTY_CONTRACT_SUMMARY };

  const actions = [
    {
      id: "open_tenant",
      label: "Open tenant",
      wired: true,
      comingSoon: false,
      page: "tenantManagement",
    },
    {
      id: "open_contracts",
      label: "Open contracts",
      wired: isLive,
      comingSoon: !isLive,
      page: "distributorOs",
      tab: "contracts",
    },
    {
      id: "open_labs",
      label: "Open labs",
      wired: canNavigateOps,
      comingSoon: !canNavigateOps,
      page: "distributorOs",
      tab: "labs",
    },
    {
      id: "open_collections",
      label: "Open collections",
      wired: canNavigateOps,
      comingSoon: !canNavigateOps,
      page: "distributorOs",
      tab: "collections",
    },
    {
      id: "open_operations",
      label: "Open operations",
      wired: canNavigateOps,
      comingSoon: !canNavigateOps,
      page: "operationsCenter",
    },
    {
      id: "assign_agent",
      label: "Assign agent",
      wired: false,
      comingSoon: true,
      page: null,
    },
    {
      id: "add_lab",
      label: "Add lab",
      wired: canNavigateOps,
      comingSoon: !canNavigateOps,
      page: "distributorOs",
      tab: "labs",
      openAddLab: true,
    },
  ];

  return {
    profile,
    health,
    contracts: contractSummary,
    team,
    teamGap: team.length === 0,
    labs,
    pipeline,
    risks,
    actions,
    isLive,
    hasData: isLive ? labs.length > 0 || (payload?.orders || []).length > 0 : false,
    mappingNote:
      "tenant_id maps to distributor company; territories are config.territories[], not separate tenants.",
  };
}

export function buildDistributorRegistry(tenants) {
  return (tenants || []).map(mapTenantToDistributorRegistryRow);
}
