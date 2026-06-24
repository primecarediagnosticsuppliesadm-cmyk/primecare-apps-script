import { ACTION_QUEUE_SEVERITY } from "@/operations/executiveActionQueueTypes.js";

function str(v) {
  return String(v ?? "").trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** User-facing territory/distributor label for agent ownership UI (never raw tenant UUID). */
export function resolveAgentLabTerritoryLabel(lab = {}) {
  const candidates = [
    lab.territory,
    lab.area,
    lab.city,
    lab.region,
    lab.distributorName,
    lab.tenantName,
    lab.tenant_name,
  ]
    .map((value) => str(value))
    .filter(Boolean);
  for (const label of candidates) {
    if (!UUID_RE.test(label)) return label;
  }
  return "";
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const OWNERSHIP_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
};

export const UNASSIGNED_CRITICAL_DAYS = 7;

export const OVERLOADED_AGENT_LAB_THRESHOLD = 12;

export function ownershipRowKey(tenantId, labId) {
  return `${str(tenantId).toLowerCase()}::${str(labId).toLowerCase()}`;
}

export function mapLabOwnershipRow(row = {}) {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id ?? row.tenantId),
    labTenantId: str(row.lab_tenant_id ?? row.labTenantId),
    labId: str(row.lab_id ?? row.labId),
    primaryAgentId: str(row.primary_agent_id ?? row.primaryAgentId),
    secondaryAgentId: str(row.secondary_agent_id ?? row.secondaryAgentId),
    managerId: str(row.manager_id ?? row.managerId),
    assignedAt: row.assigned_at ?? row.assignedAt ?? null,
    assignedBy: str(row.assigned_by ?? row.assignedBy),
    status: str(row.status || OWNERSHIP_STATUS.ACTIVE).toUpperCase(),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function buildOwnershipIndex(ownershipRows = [], labAssignments = [], hqTenantId = "") {
  const byKey = new Map();
  const hq = str(hqTenantId);

  for (const row of ownershipRows || []) {
    const mapped = mapLabOwnershipRow(row);
    if (mapped.status !== OWNERSHIP_STATUS.ACTIVE) continue;
    byKey.set(ownershipRowKey(mapped.tenantId || hq, mapped.labId), mapped);
  }

  for (const lab of labAssignments || []) {
    const labId = str(lab.labId);
    const key = ownershipRowKey(hq || lab.tenantId, labId);
    if (byKey.has(key)) continue;
    const primary = str(lab.assignedAgentId ?? lab.assigned_agent_id);
    if (!primary) continue;
    byKey.set(key, {
      id: "",
      tenantId: hq || str(lab.tenantId),
      labTenantId: str(lab.tenantId),
      labId,
      primaryAgentId: primary,
      secondaryAgentId: "",
      managerId: "",
      assignedAt: lab.updatedAt ?? lab.createdAt ?? null,
      assignedBy: "",
      status: OWNERSHIP_STATUS.ACTIVE,
      source: "legacy_lab_assignment",
    });
  }

  return byKey;
}

export function enrichLabAssignmentsWithOwnership(labAssignments = [], ownershipIndex = new Map(), hqTenantId = "") {
  const tid = str(hqTenantId);
  return (labAssignments || []).map((lab) => {
    const key = ownershipRowKey(tid || lab.tenantId, lab.labId);
    const ownership = ownershipIndex.get(key) || null;
    return {
      ...lab,
      hqTenantId: tid || lab.hqTenantId || lab.tenantId,
      ownership,
      hasOwnership: Boolean(ownership?.primaryAgentId),
      primaryAgentId: ownership?.primaryAgentId || lab.assignedAgentId || "",
      secondaryAgentId: ownership?.secondaryAgentId || "",
      managerId: ownership?.managerId || "",
      ownershipAssignedAt: ownership?.assignedAt || null,
    };
  });
}

function daysSince(value) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

export function unassignedSeverityForLab(lab = {}) {
  const unassignedSince = lab.unassignedSince ?? lab.createdAt ?? lab.ownershipAssignedAt;
  const days = daysSince(unassignedSince);
  if (days == null) return ACTION_QUEUE_SEVERITY.ATTENTION;
  return days > UNASSIGNED_CRITICAL_DAYS
    ? ACTION_QUEUE_SEVERITY.CRITICAL
    : ACTION_QUEUE_SEVERITY.ATTENTION;
}

export function computeOwnershipMetrics({
  labAssignments = [],
  ownershipIndex = new Map(),
  agents = [],
  hqTenantId = "",
} = {}) {
  const enriched = enrichLabAssignmentsWithOwnership(labAssignments, ownershipIndex, hqTenantId);
  const totalLabs = enriched.length;
  const ownedLabs = enriched.filter((l) => l.hasOwnership).length;
  const unassignedLabs = enriched.filter((l) => !l.hasOwnership);

  const labsPerAgent = new Map();
  for (const lab of enriched) {
    const agentId = str(lab.primaryAgentId).toLowerCase();
    if (!agentId) continue;
    labsPerAgent.set(agentId, (labsPerAgent.get(agentId) || 0) + 1);
  }

  const agentIdsWithProfile = new Set(
    (agents || []).map((a) => str(a.agentId).toLowerCase()).filter(Boolean)
  );

  const agentsWithNoLabs = [...agentIdsWithProfile].filter((id) => !labsPerAgent.has(id)).length;
  const overloadedAgents = [...labsPerAgent.entries()].filter(
    ([, count]) => count >= OVERLOADED_AGENT_LAB_THRESHOLD
  ).length;

  const unassignedAttention = unassignedLabs.map((lab) => ({
    ...lab,
    severity: unassignedSeverityForLab(lab),
    daysUnassigned: daysSince(lab.unassignedSince ?? lab.createdAt) ?? 0,
    recommendedAction: "Assign primary agent ownership",
  }));

  unassignedAttention.sort((a, b) => {
    const rank = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };
    const dr = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
    if (dr !== 0) return dr;
    return (b.daysUnassigned || 0) - (a.daysUnassigned || 0);
  });

  return {
    totalLabs,
    ownedLabs,
    unassignedLabs: unassignedLabs.length,
    agentsWithNoLabs,
    overloadedAgents,
    coveragePct: totalLabs > 0 ? Math.round((ownedLabs / totalLabs) * 100) : 100,
    unassignedAttention,
    labsPerAgent,
    enrichedLabs: enriched,
  };
}

export function getAgentOwnedLabs(agentId, enrichedLabs = []) {
  const key = str(agentId).toLowerCase();
  if (!key) return [];
  return enrichedLabs.filter((lab) => {
    const primary = str(lab.primaryAgentId).toLowerCase();
    const secondary = str(lab.secondaryAgentId).toLowerCase();
    return primary === key || secondary === key;
  });
}

export function getManagerOwnedLabs(managerUserId, enrichedLabs = []) {
  const uid = str(managerUserId).toLowerCase();
  if (!uid) return [];
  return enrichedLabs.filter((lab) => str(lab.managerId).toLowerCase() === uid);
}

export function getUnassignedLabs(enrichedLabs = []) {
  return enrichedLabs.filter((lab) => !lab.hasOwnership);
}

export function buildAgentOwnershipSummary({
  agentId,
  enrichedLabs = [],
  pendingCollections = [],
  qualifications = [],
} = {}) {
  const ownedLabs = getAgentOwnedLabs(agentId, enrichedLabs);
  const ownedLabIds = new Set(ownedLabs.map((l) => str(l.labId).toLowerCase()));

  const followUpsDue = (pendingCollections || []).filter((row) => {
    const lid = str(row.labId ?? row.lab_id).toLowerCase();
    return ownedLabIds.has(lid) && num(row.daysOverdue ?? row.overdueDays) > 0;
  }).length;

  const collectionFollowUps = (pendingCollections || []).filter((row) => {
    const lid = str(row.labId ?? row.lab_id).toLowerCase();
    return ownedLabIds.has(lid);
  }).length;

  const qualificationPending = (qualifications || []).filter((row) => {
    const lid = str(row.labId ?? row.lab_id).toLowerCase();
    if (!ownedLabIds.has(lid)) return false;
    const status = str(row.status ?? row.qualificationStatus).toLowerCase();
    return status === "pending" || status === "needs_info" || status === "in_review";
  }).length;

  const escalations = ownedLabs.filter(
    (lab) => num(lab.daysOverdue) > 14 || str(lab.creditStatus?.tier).toLowerCase() === "critical"
  ).length;

  return {
    assignedLabs: ownedLabs,
    assignedLabCount: ownedLabs.length,
    followUpsDue,
    escalations,
    qualificationPending,
    collectionFollowUps,
  };
}

export function ownershipRiskComponent(score = 0) {
  return Math.max(0, Math.min(100, Math.round(num(score))));
}
