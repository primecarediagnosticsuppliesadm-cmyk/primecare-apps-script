import { buildQualificationRecommendations } from "@/operations/qualificationRecommendationEngine.js";
import { buildContractRenewalIntelligence } from "@/contracts/contractRenewalIntelligenceEngine.js";
import { buildLabContractModel } from "@/labContract/labContractEngine.js";
import {
  ACTION_PLAN_TYPES,
  ACTION_QUEUE_SEVERITY,
  ACTION_QUEUE_SOURCE_MODULES,
  queueItemId,
} from "@/operations/executiveActionQueueTypes.js";
import {
  commissionAmountToSeverity,
  computeExecutiveImpactScore,
  computeOwnershipImpactScore,
  normalizeRevenueImpact,
  qualificationBandToSeverity,
  renewalRiskToSeverity,
  severityComponent,
} from "@/operations/executiveActionQueueImpact.js";
import { OVERLOADED_AGENT_LAB_THRESHOLD } from "@/operations/labOwnershipEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseMonthlyInr(row = {}) {
  return num(row.monthlyConsumablesEstimate ?? row.monthly_consumables_estimate);
}

function daysSinceIso(iso) {
  const s = str(iso).slice(0, 10);
  if (!s) return 0;
  const ms = Date.now() - Date.parse(s);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

function qualificationActionPlan(labId, tenantId) {
  return [
    {
      id: "open_qualification_review",
      label: "Take action",
      type: ACTION_PLAN_TYPES.WRITE,
      action: "open_qualification_review",
      payload: { labId, tenantId },
      variant: "primary",
    },
    {
      id: "advance_pipeline",
      label: "Advance pipeline",
      type: ACTION_PLAN_TYPES.WRITE,
      action: "advance_qualification_pipeline",
      payload: { labId, tenantId },
      variant: "secondary",
    },
    {
      id: "assign_qual",
      label: "Assign",
      type: ACTION_PLAN_TYPES.WORKFLOW,
      action: "assign_owner",
      variant: "secondary",
    },
  ];
}

function contractActionPlan(contractId, distributorId) {
  return [
    {
      id: "renew_contract",
      label: "Renew contract",
      type: ACTION_PLAN_TYPES.WRITE,
      action: "renew_lab_contract",
      payload: { contractId, distributorId },
      variant: "primary",
    },
    {
      id: "mark_under_review",
      label: "Under review",
      type: ACTION_PLAN_TYPES.WRITE,
      action: "mark_contract_under_review",
      payload: { contractId, distributorId },
      variant: "secondary",
    },
    {
      id: "escalate_contract",
      label: "Escalate",
      type: ACTION_PLAN_TYPES.WORKFLOW,
      action: "escalate",
      variant: "secondary",
    },
  ];
}

function commissionActionPlan(entry) {
  const distributorId = str(entry.distributorId);
  const entryId = str(entry.id);
  return [
    {
      id: "approve_commission",
      label: "Approve",
      type: ACTION_PLAN_TYPES.WRITE,
      action: "approve_commission",
      payload: {
        distributorId,
        entryId,
        periodYmd: str(entry.periodYmd),
        agentName: str(entry.agentName),
      },
      variant: "primary",
    },
    {
      id: "open_commission",
      label: "Open engine",
      type: ACTION_PLAN_TYPES.NAVIGATE,
      action: "commissionEngine",
      payload: { distributorId, periodYmd: str(entry.periodYmd) },
      variant: "secondary",
    },
    {
      id: "mark_commission_reviewed",
      label: "Reviewed",
      type: ACTION_PLAN_TYPES.WORKFLOW,
      action: "mark_reviewed",
      variant: "secondary",
    },
  ];
}

/**
 * @param {object[]} qualifications
 * @param {number} [limit]
 */
export function ingestQualificationQueueItems(qualifications = [], limit = 12) {
  const recs = buildQualificationRecommendations(qualifications, limit);
  return recs.map((rec) => {
    const labId = str(rec.labId);
    const tenantId = str(rec.row?.tenantId ?? rec.row?.tenant_id);
    const monthly = parseMonthlyInr(rec.row);
    const revenueImpact = normalizeRevenueImpact(monthly, 80_000);
    const band = str(rec.band).toLowerCase();
    const status = str(rec.row?.status ?? rec.row?.qualificationStatus).toLowerCase();
    const severity = qualificationBandToSeverity(rec.band);
    const ageDays = daysSinceIso(
      rec.row?.pipelineStageUpdatedAt ??
        rec.row?.pipeline_stage_updated_at ??
        rec.row?.updatedAt ??
        rec.row?.updated_at
    );
    const urgencyScore =
      band === "hot" ? 92 : band === "warm" ? 68 : status === "needs_info" ? 75 : 45;
    const impactScore = computeExecutiveImpactScore({
      revenueImpact,
      urgencyScore,
      ageDays,
      severity,
    });

    return {
      id: queueItemId(ACTION_QUEUE_SOURCE_MODULES.QUALIFICATION, labId),
      sourceModule: ACTION_QUEUE_SOURCE_MODULES.QUALIFICATION,
      severity,
      title: "Qualification review",
      summary: rec.whyMatters || rec.recommendedAction,
      subtitle: rec.labName || labId,
      recommendedAction: rec.recommendedAction,
      ageLabel: ageDays > 0 ? `${ageDays}d in stage` : rec.stageLabel || "",
      owner: str(rec.row?.agentName ?? rec.row?.agent_name),
      entityRefs: {
        labId,
        labName: rec.labName,
        tenantId,
        distributorId: str(rec.row?.distributorId ?? rec.row?.distributor_id),
      },
      impactScore,
      revenueImpact,
      urgencyScore,
      ageScore: Math.min(100, ageDays * 4),
      severityScore: severityComponent(severity),
      ageDays,
      createdAt: rec.row?.updated_at ?? rec.row?.updatedAt ?? null,
      clusterType: "pending_qualification",
      actionPlan: qualificationActionPlan(labId, tenantId),
    };
  });
}

/**
 * @param {object[]} contracts
 * @param {object} [payload]
 */
export function ingestContractRenewalQueueItems(contracts = [], payload = {}) {
  const contractModel = buildLabContractModel(contracts, payload, new Set());
  const renewal = buildContractRenewalIntelligence(contractModel);
  return (renewal.interventionQueue || []).map((row) => {
    const contractId = str(row.contractId);
    const daysRemaining = num(row.daysRemaining);
    const revenueAtRisk = num(row.revenueAtRisk);
    const revenueImpact = normalizeRevenueImpact(revenueAtRisk, 400_000);
    const severity = renewalRiskToSeverity(row.riskLevel);
    const ageDays = daysRemaining >= 0 ? Math.max(0, 90 - daysRemaining) : 0;
    const urgencyScore = clampUrgencyFromDaysRemaining(daysRemaining);
    const impactScore = computeExecutiveImpactScore({
      revenueImpact,
      urgencyScore,
      ageDays,
      severity,
    });

    return {
      id: queueItemId(ACTION_QUEUE_SOURCE_MODULES.CONTRACT_RENEWAL, contractId),
      sourceModule: ACTION_QUEUE_SOURCE_MODULES.CONTRACT_RENEWAL,
      severity,
      title: "Contract renewal",
      summary: `${row.revenueAtRiskLabel} at risk · expires ${row.expiryDate}`,
      subtitle: `${row.labName} · ${row.distributorName}`,
      recommendedAction: `Renew before ${row.expiryDate} (${row.daysRemaining}d remaining)`,
      ageLabel: `${row.daysRemaining}d to expiry`,
      owner: "",
      entityRefs: {
        contractId,
        labId: str(row.labId),
        labName: str(row.labName),
        distributorId: str(row.distributorId),
      },
      impactScore,
      revenueImpact,
      urgencyScore,
      ageScore: Math.min(100, ageDays * 4),
      severityScore: severityComponent(severity),
      ageDays,
      createdAt: row.expiryDate || null,
      clusterType: "contract_renewal",
      actionPlan: contractActionPlan(contractId, str(row.distributorId)),
    };
  });
}

function clampUrgencyFromDaysRemaining(daysRemaining) {
  if (daysRemaining == null || daysRemaining < 0) return 20;
  if (daysRemaining <= 30) return 100;
  if (daysRemaining <= 60) return 78;
  if (daysRemaining <= 90) return 55;
  return 25;
}

/**
 * @param {object[]} pendingEntries — commission_entries with status pending
 */
export function ingestCommissionQueueItems(pendingEntries = [], limit = 15) {
  const sorted = [...pendingEntries]
    .filter((e) => str(e.status).toLowerCase() === "pending")
    .sort((a, b) => num(b.commissionAmount) - num(a.commissionAmount))
    .slice(0, limit);

  return sorted.map((entry) => {
    const entryId = str(entry.id);
    const amount = num(entry.commissionAmount);
    const revenueImpact = normalizeRevenueImpact(amount, 25_000);
    const severity = commissionAmountToSeverity(amount);
    const ageDays = daysSinceIso(entry.updatedAt ?? entry.createdAt);
    const urgencyScore = amount >= 10_000 ? 80 : 55;
    const impactScore = computeExecutiveImpactScore({
      revenueImpact,
      urgencyScore,
      ageDays,
      severity,
    });

    return {
      id: queueItemId(ACTION_QUEUE_SOURCE_MODULES.COMMISSION, entryId),
      sourceModule: ACTION_QUEUE_SOURCE_MODULES.COMMISSION,
      severity,
      title: "Commission approval",
      summary: `₹${amount.toLocaleString("en-IN")} pending · ${str(entry.periodYmd).slice(0, 7)}`,
      subtitle: str(entry.agentName) || str(entry.agentKey) || "Agent",
      recommendedAction: "Approve commission entry for payout cycle",
      ageLabel: ageDays > 0 ? `${ageDays}d pending` : "Pending",
      owner: str(entry.agentName),
      entityRefs: {
        commissionEntryId: entryId,
        distributorId: str(entry.distributorId),
        agentKey: str(entry.agentKey),
        periodYmd: str(entry.periodYmd),
        commissionAmount: amount,
      },
      impactScore,
      revenueImpact,
      urgencyScore,
      ageScore: Math.min(100, ageDays * 4),
      severityScore: severityComponent(severity),
      ageDays,
      createdAt: entry.createdAt || null,
      clusterType: "commission_pending",
      actionPlan: commissionActionPlan(entry),
    };
  });
}

function ownershipActionPlan(labId, tenantId, labTenantId) {
  return [
    {
      id: "assign_ownership",
      label: "Assign owner",
      type: ACTION_PLAN_TYPES.NAVIGATE,
      action: "operationsCenter",
      payload: { labId, tenantId, labTenantId, openAssignDrawer: true, tab: "labOwnership" },
      variant: "primary",
    },
    {
      id: "escalate_ownership",
      label: "Escalate",
      type: ACTION_PLAN_TYPES.WORKFLOW,
      action: "escalate",
      variant: "secondary",
    },
  ];
}

/**
 * @param {object} ownershipMetrics
 * @param {object[]} directoryUsers
 */
export function ingestOwnershipRisk(ownershipMetrics = {}, directoryUsers = []) {
  const items = [];
  const metrics = ownershipMetrics || {};
  const enriched = metrics.enrichedLabs || [];
  const activeUserIds = new Set(
    (directoryUsers || []).filter((u) => u.active !== false).map((u) => str(u.userId).toLowerCase())
  );

  for (const lab of metrics.unassignedAttention || []) {
    const labId = str(lab.labId);
    const tenantId = str(lab.hqTenantId ?? lab.tenantId);
    const labTenantId = str(lab.tenantId);
    const days = num(lab.daysUnassigned);
    const severity = str(lab.severity).toUpperCase();
    const revenueImpact = normalizeRevenueImpact(num(lab.outstanding) || 5000, 80_000);
    const urgencyScore = severity === "CRITICAL" ? 95 : 70;
    const ownershipRisk = severity === "CRITICAL" ? 100 : 65;
    const impactScore = computeOwnershipImpactScore({
      revenueImpact,
      urgencyScore,
      ageDays: days,
      ownershipRisk,
      severity,
    });

    items.push({
      id: queueItemId(ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP, `unassigned:${labTenantId}:${labId}`),
      sourceModule: ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP,
      severity,
      title: "Unassigned lab",
      summary: `No primary owner · ${days}d unassigned`,
      subtitle: lab.labName || labId,
      recommendedAction: "Assign primary agent ownership in Operations Center",
      ageLabel: days > 0 ? `${days}d unassigned` : "Unassigned",
      owner: "—",
      entityRefs: { labId, labName: lab.labName, tenantId, distributorId: labTenantId },
      impactScore,
      revenueImpact,
      urgencyScore,
      ageScore: Math.min(100, days * 4),
      severityScore: severityComponent(severity),
      ownershipRisk,
      ageDays: days,
      clusterType: "ownership_unassigned",
      actionPlan: ownershipActionPlan(labId, tenantId, labTenantId),
    });
  }

  for (const lab of enriched) {
    if (!lab.hasOwnership || lab.secondaryAgentId) continue;
    const labId = str(lab.labId);
    const tenantId = str(lab.hqTenantId ?? lab.tenantId);
    const severity = ACTION_QUEUE_SEVERITY.ATTENTION;
    items.push({
      id: queueItemId(ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP, `no_secondary:${lab.tenantId}:${labId}`),
      sourceModule: ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP,
      severity,
      title: "No secondary owner",
      summary: "Lab has primary owner but no backup agent",
      subtitle: lab.labName || labId,
      recommendedAction: "Assign secondary agent for coverage",
      owner: lab.primaryAgentId || "—",
      entityRefs: { labId, labName: lab.labName, tenantId },
      impactScore: computeOwnershipImpactScore({
        revenueImpact: 35,
        urgencyScore: 50,
        ageDays: 0,
        ownershipRisk: 55,
        severity,
      }),
      revenueImpact: 35,
      urgencyScore: 50,
      ageScore: 0,
      severityScore: severityComponent(severity),
      ownershipRisk: 55,
      clusterType: "ownership_no_secondary",
      actionPlan: ownershipActionPlan(labId, tenantId, lab.tenantId),
    });
  }

  const labsPerAgent = metrics.labsPerAgent || new Map();
  for (const [agentId, count] of labsPerAgent.entries()) {
    if (count < OVERLOADED_AGENT_LAB_THRESHOLD) continue;
    const severity = ACTION_QUEUE_SEVERITY.ATTENTION;
    items.push({
      id: queueItemId(ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP, `overloaded:${agentId}`),
      sourceModule: ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP,
      severity,
      title: "Overloaded agent",
      summary: `${count} labs assigned to one agent`,
      subtitle: agentId,
      recommendedAction: "Rebalance lab ownership across field agents",
      owner: agentId,
      entityRefs: { agentKey: agentId },
      impactScore: computeOwnershipImpactScore({
        revenueImpact: 50,
        urgencyScore: 75,
        ageDays: 0,
        ownershipRisk: 80,
        severity,
      }),
      revenueImpact: 50,
      urgencyScore: 75,
      ageScore: 0,
      severityScore: severityComponent(severity),
      ownershipRisk: 80,
      clusterType: "ownership_overloaded_agent",
      actionPlan: [
        {
          id: "open_ops_center",
          label: "Open Ops Center",
          type: ACTION_PLAN_TYPES.NAVIGATE,
          action: "operationsCenter",
          payload: { tab: "labOwnership" },
          variant: "primary",
        },
      ],
    });
  }

  for (const lab of enriched) {
    const managerId = str(lab.managerId).toLowerCase();
    if (!managerId || activeUserIds.has(managerId)) continue;
    const labId = str(lab.labId);
    const severity = ACTION_QUEUE_SEVERITY.CRITICAL;
    items.push({
      id: queueItemId(ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP, `inactive_manager:${labId}`),
      sourceModule: ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP,
      severity,
      title: "Owner inactive",
      summary: "Distributor manager on lab ownership is inactive or missing",
      subtitle: lab.labName || labId,
      recommendedAction: "Reassign distributor manager on lab ownership",
      owner: lab.managerId,
      entityRefs: { labId, labName: lab.labName, tenantId: str(lab.hqTenantId) },
      impactScore: computeOwnershipImpactScore({
        revenueImpact: 60,
        urgencyScore: 85,
        ageDays: 7,
        ownershipRisk: 90,
        severity,
      }),
      revenueImpact: 60,
      urgencyScore: 85,
      ageScore: 28,
      severityScore: severityComponent(severity),
      ownershipRisk: 90,
      clusterType: "ownership_inactive_manager",
      actionPlan: ownershipActionPlan(labId, str(lab.hqTenantId), lab.tenantId),
    });
  }

  return items;
}
