import { LOGIN_ENABLED_ROLES, ROLES } from "@/config/roles.js";
import {
  isAgentRole,
  labsForAgent,
  matchesSearch,
  normalizePlatformRole,
  platformRoleLabel,
} from "@/operations/operationsCenterAdminEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

export function isLoginEnabledRole(role) {
  return LOGIN_ENABLED_ROLES.has(normalizePlatformRole(role));
}

export function enrichDirectoryUsers(users = [], options = {}) {
  const distributorNameById = options.distributorNameById || new Map();
  const labAssignments = options.labAssignments || [];
  const distributorAssignments = options.distributorAssignments || [];

  return users.map((user) => {
    const role = normalizePlatformRole(user.role);
    let assignedLabsCount = 0;
    let distributorName = "";
    let distributorId = str(user.distributorId);

    if (isAgentRole(role)) {
      assignedLabsCount = labsForAgent(user, labAssignments).length;
      const dist = distributorAssignments.find(
        (d) => str(d.assignedAgentUserId).toLowerCase() === str(user.userId).toLowerCase()
      );
      if (dist) {
        distributorName = str(dist.distributorName);
        if (!distributorId) distributorId = str(dist.distributorId);
      }
    } else if (role === ROLES.DISTRIBUTOR_ADMIN) {
      distributorName = distributorNameById.get(distributorId) || distributorId;
    } else if (role === ROLES.LAB) {
      assignedLabsCount = user.labId ? 1 : 0;
    }

    return {
      ...user,
      role,
      roleLabel: platformRoleLabel(role),
      distributorId,
      distributorName: distributorName || "—",
      territory: str(user.territory) || "—",
      assignedLabsCount,
      lastLogin: "—",
      loginEnabled: isLoginEnabledRole(role),
      createdAt: user.createdAt ?? null,
    };
  });
}

export function computeProvisioningKpis(users = [], labAssignments = []) {
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.active !== false).length;
  const agents = users.filter((u) => isAgentRole(u.role)).length;
  const inactiveUsers = users.filter((u) => u.active === false).length;
  const labsAssigned = labAssignments.filter((l) => str(l.assignedAgentId)).length;
  const unassignedLabs = labAssignments.filter((l) => !str(l.assignedAgentId)).length;

  return {
    totalUsers,
    activeUsers,
    agents,
    labsAssigned,
    inactiveUsers,
    unassignedLabs,
  };
}

export function filterDirectoryUsers(users = [], filters = {}) {
  const roleFilter = str(filters.role).toLowerCase();
  const statusFilter = str(filters.status).toLowerCase();
  const distributorFilter = str(filters.distributorId);
  const search = str(filters.search);

  return users.filter((user) => {
    if (roleFilter && normalizePlatformRole(user.role) !== roleFilter) return false;
    if (statusFilter === "active" && user.active === false) return false;
    if (statusFilter === "inactive" && user.active !== false) return false;
    if (distributorFilter && str(user.distributorId) !== distributorFilter) return false;
    if (
      !matchesSearch(search, [
        user.name,
        user.displayName,
        user.email,
        user.roleLabel,
        user.role,
        user.distributorName,
        user.territory,
        user.agentId,
        user.labId,
        user.username,
      ])
    ) {
      return false;
    }
    return true;
  });
}

export function sortDirectoryUsers(users = [], sortKey = "name", sortDir = "asc") {
  const dir = sortDir === "desc" ? -1 : 1;
  const key = str(sortKey) || "name";

  return [...users].sort((a, b) => {
    let av;
    let bv;
    switch (key) {
      case "role":
        av = str(a.roleLabel);
        bv = str(b.roleLabel);
        break;
      case "status":
        av = a.active === false ? 0 : 1;
        bv = b.active === false ? 0 : 1;
        break;
      case "labs":
        av = Number(a.assignedLabsCount) || 0;
        bv = Number(b.assignedLabsCount) || 0;
        break;
      case "created":
        av = new Date(a.createdAt || 0).getTime();
        bv = new Date(b.createdAt || 0).getTime();
        break;
      default:
        av = str(a.name || a.displayName).toLowerCase();
        bv = str(b.name || b.displayName).toLowerCase();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export function territoryOptionsFromDistributors(distributors = []) {
  const set = new Set();
  for (const dist of distributors) {
    const territories = dist.territories || dist.configTerritories || [];
    if (Array.isArray(territories)) {
      for (const t of territories) {
        const v = str(t);
        if (v) set.add(v);
      }
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function suggestAgentId(displayName = "") {
  const slug = str(displayName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 12);
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return slug ? `AGT_${slug}_${suffix}` : `AGT_${suffix}`;
}

export function mapProvisioningEventRow(row = {}, userNameById = new Map()) {
  return {
    id: str(row.id),
    eventType: str(row.event_type ?? row.eventType),
    subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
    subjectName: userNameById.get(str(row.subject_user_id)) || str(row.subject_user_id).slice(0, 8),
    actorUserId: str(row.actor_user_id ?? row.actorUserId),
    payload: row.payload || {},
    createdAt: row.created_at ?? row.createdAt,
  };
}
