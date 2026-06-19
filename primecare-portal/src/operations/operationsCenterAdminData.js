import {
  getOperationsLabAssignmentsRead,
  getOperationsOperationalAgentsRead,
  getOperationsPlatformUsersRead,
} from "@/api/primecareSupabaseApi.js";
import {
  deriveAgentsFromPlatformUsers,
  mapLabAssignmentRow,
  mapOperationsAgentRow,
  mapPlatformUserRow,
} from "@/operations/operationsCenterAdminEngine.js";

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
      labAssignments: [],
    };
  }

  const [usersRes, operationalAgentsRes, labsRes] = await Promise.all([
    getOperationsPlatformUsersRead({ tenantId: tid }),
    getOperationsOperationalAgentsRead({ tenantId: tid }),
    getOperationsLabAssignmentsRead({ tenantId: tid }),
  ]);

  const errors = [usersRes?.error, operationalAgentsRes?.error, labsRes?.error].filter(Boolean);
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
  const agents = mergeAgentsByAgentId(profileAgents, operationalAgents);

  return {
    ok:
      usersRes?.success !== false &&
      operationalAgentsRes?.success !== false &&
      labsRes?.success !== false,
    error: errors[0] || null,
    agents,
    users,
    labAssignments: (labsRes?.data?.labs || []).map(mapLabAssignmentRow),
  };
}
