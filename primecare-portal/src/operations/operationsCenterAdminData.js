import {
  getOperationsAgentsRead,
  getOperationsLabAssignmentsRead,
  getOperationsPlatformUsersRead,
} from "@/api/primecareSupabaseApi.js";
import {
  mapLabAssignmentRow,
  mapOperationsAgentRow,
  mapPlatformUserRow,
} from "@/operations/operationsCenterAdminEngine.js";

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
      labAssignments: [],
    };
  }

  const [agentsRes, usersRes, labsRes] = await Promise.all([
    getOperationsAgentsRead({ tenantId: tid }),
    getOperationsPlatformUsersRead({ tenantId: tid }),
    getOperationsLabAssignmentsRead({ tenantId: tid }),
  ]);

  const errors = [
    agentsRes?.error,
    usersRes?.error,
    labsRes?.error,
  ].filter(Boolean);

  return {
    ok: agentsRes?.success !== false && usersRes?.success !== false && labsRes?.success !== false,
    error: errors[0] || null,
    agents: (agentsRes?.data?.agents || []).map(mapOperationsAgentRow),
    users: (usersRes?.data?.users || []).map(mapPlatformUserRow),
    labAssignments: (labsRes?.data?.labs || []).map(mapLabAssignmentRow),
  };
}
