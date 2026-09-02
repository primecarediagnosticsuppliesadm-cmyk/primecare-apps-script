import {
  getOperationsDistributorAssignmentsRead,
  getOperationsLabAssignmentsRead,
  getOperationsOperationalAgentsRead,
  getOperationsPlatformUsersRead,
} from "@/api/primecareSupabaseApi.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import {
  composeOperationsCenterMergedAgents,
  enrichAgentsWithAssignmentCounts,
  mapDistributorAssignmentRow,
  mapLabAssignmentRow,
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

  const composed = composeOperationsCenterMergedAgents(
    usersRes?.data?.users || [],
    operationalAgentsRes?.data?.agents || []
  );
  const users = composed.users;
  const mergedAgents = composed.agents;

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
