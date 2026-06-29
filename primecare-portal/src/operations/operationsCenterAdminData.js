import {
  getOperationsDistributorAssignmentsRead,
  getOperationsLabAssignmentsRead,
  getOperationsOperationalAgentsRead,
  getOperationsPlatformUsersRead,
} from "@/api/primecareSupabaseApi.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import {
  deriveAgentsFromPlatformUsers,
  enrichAgentsWithAssignmentCounts,
  mapDistributorAssignmentRow,
  mapLabAssignmentRow,
  mapOperationsAgentRow,
  mapPlatformUserRow,
  enrichLabAssignmentsWithAgentNames,
} from "@/operations/operationsCenterAdminEngine.js";
import {
  computeProvisioningKpis,
  enrichDirectoryUsers,
  mapProvisioningEventRow,
} from "@/operations/userProvisioningEngine.js";
import { computeUserDirectoryIntegrityWarnings } from "@/operations/userDirectoryIntegrityEngine.js";
import {
  buildAccessAuditContext,
  enrichAccessAuditEvents,
} from "@/operations/accessAuditEngine.js";
import { getLabOwnershipRead } from "@/api/labOwnershipApi.js";
import {
  buildOwnershipIndex,
  computeOwnershipMetrics,
} from "@/operations/labOwnershipEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function mergeAgentsByAgentId(profileAgents = [], operationalAgents = []) {
  const byAgentId = new Map();
  for (const agent of profileAgents) {
    const key = str(agent.agentId).toLowerCase() || str(agent.id).toLowerCase();
    if (key) byAgentId.set(key, agent);
  }
  for (const agent of operationalAgents) {
    const key = str(agent.agentId).toLowerCase() || str(agent.id).toLowerCase();
    if (!key || byAgentId.has(key)) continue;
    byAgentId.set(key, agent);
  }
  return Array.from(byAgentId.values()).sort((a, b) =>
    str(a.name).localeCompare(str(b.name), undefined, { sensitivity: "base" })
  );
}

export async function loadOperationsCenterAdminBundle(tenantId) {
  const tid = str(tenantId);
  if (!tid) {
    return {
      ok: false,
      error: "Tenant context is missing. Re-login and try again.",
      agents: [],
      users: [],
      directoryUsers: [],
      labAssignments: [],
      distributorAssignments: [],
      auditEvents: [],
      kpis: computeProvisioningKpis([], []),
    };
  }

  const [usersRes, operationalAgentsRes, labsRes, distributorsRes, auditRes, ownershipRes] =
    await Promise.all([
    getOperationsPlatformUsersRead({ tenantId: tid }),
    getOperationsOperationalAgentsRead({ tenantId: tid }),
    getOperationsLabAssignmentsRead({ tenantId: tid }),
    getOperationsDistributorAssignmentsRead({ tenantId: tid }),
    getUserProvisioningEventsRead({ tenantId: tid }),
    getLabOwnershipRead({ tenantId: tid }),
  ]);

  const errors = [
    usersRes?.error,
    operationalAgentsRes?.error,
    labsRes?.error,
    distributorsRes?.error,
    distributorsRes?.warning,
    auditRes?.error,
    ownershipRes?.error,
  ].filter(Boolean);

  const operationalAgents = (operationalAgentsRes?.data?.agents || []).map(mapOperationsAgentRow);
  const operationalByUserId = new Map();
  for (const agent of operationalAgents) {
    const key = str(agent.userId).toLowerCase();
    if (key) operationalByUserId.set(key, agent);
  }

  const users = (usersRes?.data?.users || []).map((row) => {
    const op = operationalByUserId.get(str(row.user_id ?? row.userId).toLowerCase());
    if (!op?.name) return mapPlatformUserRow(row);
    return mapPlatformUserRow({
      ...row,
      user_name: str(row.user_name) || op.name,
      agent_name: str(row.agent_name) || op.name,
    });
  });

  const profileAgents = deriveAgentsFromPlatformUsers(users);
  const mergedAgents = mergeAgentsByAgentId(profileAgents, operationalAgents);

  const distributorAssignments = (distributorsRes?.data?.distributors || []).map((row) =>
    mapDistributorAssignmentRow(row)
  );

  const tenantNameById = new Map();
  const distributorNameById = new Map();
  for (const row of distributorAssignments) {
    tenantNameById.set(str(row.distributorId), str(row.distributorName));
    distributorNameById.set(str(row.distributorId), str(row.distributorName));
  }

  const labAssignments = enrichLabAssignmentsWithAgentNames(
    (labsRes?.data?.labs || []).map((row) => mapLabAssignmentRow(row, tenantNameById)),
    mergedAgents
  );

  const agents = enrichAgentsWithAssignmentCounts(
    mergedAgents,
    labAssignments,
    distributorAssignments
  );

  const directoryUsers = enrichDirectoryUsers(users, {
    distributorNameById,
    labAssignments,
    distributorAssignments,
    ownershipRows: ownershipRes?.data?.rows || [],
  });

  const enrichedLabAssignments = enrichLabAssignmentsWithAgentNames(
    labAssignments,
    directoryUsers
  );

  const userNameById = new Map(directoryUsers.map((u) => [str(u.userId), str(u.name)]));
  const auditContext = buildAccessAuditContext(
    { directoryUsers, labAssignments: enrichedLabAssignments, distributorAssignments },
    tid
  );
  const auditEvents = enrichAccessAuditEvents(
    (auditRes?.data?.events || []).map((row) => mapProvisioningEventRow(row, userNameById)),
    auditContext
  );

  const kpis = computeProvisioningKpis(directoryUsers, enrichedLabAssignments);

  const ownershipRows = ownershipRes?.data?.rows || [];
  const ownershipIndex = buildOwnershipIndex(ownershipRows, enrichedLabAssignments, tid);
  const ownershipMetrics = computeOwnershipMetrics({
    labAssignments: enrichedLabAssignments,
    ownershipIndex,
    agents,
    hqTenantId: tid,
  });

  const directoryIntegrity = computeUserDirectoryIntegrityWarnings({
    directoryUsers,
    labAssignments: ownershipMetrics.enrichedLabs,
    ownershipRows,
  });

  return {
    ok:
      usersRes?.success !== false &&
      operationalAgentsRes?.success !== false &&
      labsRes?.success !== false &&
      distributorsRes?.success !== false,
    error: errors[0] || null,
    warning: distributorsRes?.warning || auditRes?.error || ownershipRes?.error || null,
    agents,
    users,
    directoryUsers,
    labAssignments: ownershipMetrics.enrichedLabs,
    distributorAssignments,
    auditEvents,
    kpis,
    ownershipRows,
    ownershipMetrics,
    directoryIntegrity,
  };
}

/** Lightweight ownership metrics for executive queue + ops command center. */
export async function loadLabOwnershipMetricsBundle(tenantId) {
  const tid = str(tenantId);
  if (!tid) return { ownershipMetrics: null, directoryUsers: [] };

  const partial = await loadOperationsCenterAdminBundle(tid);
  return {
    ownershipMetrics: partial.ownershipMetrics || null,
    directoryUsers: partial.directoryUsers || [],
    labAssignments: partial.labAssignments || [],
    agents: partial.agents || [],
  };
}
