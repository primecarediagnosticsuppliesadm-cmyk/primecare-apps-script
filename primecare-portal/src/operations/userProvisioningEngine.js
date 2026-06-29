import { ROLES } from "@/config/roles.js";
import { isLoginEnabledRole as matrixIsLoginEnabledRole } from "@/config/rolePermissionMatrix.js";
import {
  isAgentRole,
  labsForAgent,
  matchesSearch,
  normalizePlatformRole,
  platformRoleLabel,
} from "@/operations/operationsCenterAdminEngine.js";
import {
  classifyDirectoryUser,
  isRealDirectoryUser,
  USER_DIRECTORY_CLASS,
  USER_DIRECTORY_CLASS_LABELS,
} from "@/operations/userDirectoryClassification.js";
import { getDirectoryDefaultAudience, showQaProbeComplexity } from "@/config/hqReleasePolicy.js";
import { countOwnershipLabsForAgent, countAgentLabsPortalAligned } from "@/operations/userDirectoryIntegrityEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

export { USER_DIRECTORY_CLASS, USER_DIRECTORY_CLASS_LABELS };

export function isLoginEnabledRole(role) {
  return matrixIsLoginEnabledRole(normalizePlatformRole(role));
}

function formatDistributorDisplay(value) {
  const v = str(value);
  if (!v || v === "—") return "";
  return v;
}

function formatTerritoryDisplay(value) {
  const v = str(value);
  if (!v || v === "—") return "";
  return v;
}

export function enrichDirectoryUsers(users = [], options = {}) {
  const distributorNameById = options.distributorNameById || new Map();
  const labAssignments = options.labAssignments || [];
  const distributorAssignments = options.distributorAssignments || [];
  const ownershipRows = options.ownershipRows || [];

  return users.map((user) => {
    const role = normalizePlatformRole(user.role);
    let assignedLabsCount = 0;
    let assignedLabsFromAssignments = 0;
    let assignedLabsFromOwnership = 0;
    let distributorName = "";
    let distributorId = str(user.distributorId);

    if (isAgentRole(role)) {
      assignedLabsFromAssignments = labsForAgent(user, labAssignments).length;
      assignedLabsFromOwnership = countOwnershipLabsForAgent(user, ownershipRows, { labAssignments });
      assignedLabsCount = countAgentLabsPortalAligned(user, labAssignments, ownershipRows);
      const dist = distributorAssignments.find(
        (d) => str(d.assignedAgentUserId).toLowerCase() === str(user.userId).toLowerCase()
      );
      if (dist) {
        distributorName = str(dist.distributorName);
        if (!distributorId) distributorId = str(dist.distributorId);
      }
    } else if (role === ROLES.DISTRIBUTOR_ADMIN || role === ROLES.DISTRIBUTOR_MANAGER) {
      distributorName = distributorNameById.get(distributorId) || distributorId;
    } else if (role === ROLES.LAB) {
      assignedLabsCount = user.labId ? 1 : 0;
    }

    const userClass = classifyDirectoryUser(user);
    const labCountMismatch =
      isAgentRole(role) &&
      (assignedLabsFromAssignments !== assignedLabsCount ||
        assignedLabsFromOwnership !== assignedLabsCount);

    return {
      ...user,
      role,
      roleLabel: platformRoleLabel(role),
      userClass,
      userClassLabel: USER_DIRECTORY_CLASS_LABELS[userClass] || "User",
      isRealUser: userClass === USER_DIRECTORY_CLASS.REAL,
      distributorId,
      distributorName: formatDistributorDisplay(distributorName),
      territory: formatTerritoryDisplay(user.territory),
      assignedLabsCount,
      assignedLabsFromAssignments,
      assignedLabsFromOwnership,
      labCountMismatch,
      lastLoginAt: user.lastLoginAt ?? user.last_login_at ?? null,
      lastLogin: formatLastLogin(user.lastLoginAt ?? user.last_login_at),
      loginEnabled: isLoginEnabledRole(role),
      hasStoredEmail: Boolean(str(user.email ?? user.storedEmail)),
      createdAt: user.createdAt ?? null,
    };
  });
}

export function computeProvisioningKpis(users = [], labAssignments = []) {
  const realUsers = users.filter(isRealDirectoryUser);
  const totalUsers = users.length;
  const productionUsers = realUsers.length;
  const realActiveUsers = realUsers.filter((u) => u.active !== false).length;
  const qaTestUsers = users.filter((u) => classifyDirectoryUser(u) === USER_DIRECTORY_CLASS.QA_TEST).length;
  const probeDebugUsers = users.filter(
    (u) => classifyDirectoryUser(u) === USER_DIRECTORY_CLASS.PROBE_DEBUG
  ).length;
  const fieldAgents = users.filter((u) => isAgentRole(u.role)).length;
  const labUsers = users.filter((u) => normalizePlatformRole(u.role) === ROLES.LAB).length;
  const hqAdmins = users.filter((u) => {
    const role = normalizePlatformRole(u.role);
    return role === ROLES.ADMIN || role === ROLES.EXECUTIVE;
  }).length;
  const inactiveAccounts = users.filter((u) => u.active === false).length;
  const inactiveUsers = realUsers.filter((u) => u.active === false).length;
  const labsAssigned = labAssignments.filter((l) => str(l.assignedAgentId ?? l.primaryAgentId)).length;
  const unassignedLabs = labAssignments.filter((l) => !str(l.assignedAgentId ?? l.primaryAgentId)).length;

  return {
    totalUsers,
    productionUsers,
    qaUsers: qaTestUsers,
    probeUsers: probeDebugUsers,
    fieldAgents,
    labUsers,
    hqAdmins,
    inactiveAccounts,
    labsAssigned,
    unassignedLabs,
    /** Legacy aliases used by existing certification scripts */
    realUsers: productionUsers,
    realActiveUsers,
    inactiveUsers,
    probeDebugUsers,
    qaTestUsers,
    activeUsers: realActiveUsers,
    agents: fieldAgents,
  };
}

export function computeDirectoryAudienceCounts(users = []) {
  const list = users || [];
  return {
    total: list.length,
    production: list.filter((u) => classifyDirectoryUser(u) === USER_DIRECTORY_CLASS.REAL).length,
    qa: list.filter((u) => classifyDirectoryUser(u) === USER_DIRECTORY_CLASS.QA_TEST).length,
    probe: list.filter((u) => classifyDirectoryUser(u) === USER_DIRECTORY_CLASS.PROBE_DEBUG).length,
    inactive: list.filter((u) => u.active === false).length,
  };
}

export function buildDirectoryAudienceFilterOptions(users = [], options = {}) {
  const showQa = options.showQaComplexity ?? showQaProbeComplexity();
  const counts = computeDirectoryAudienceCounts(users);
  const optionsList = [
    { id: "", label: `All Users (${counts.total})` },
    { id: "real", label: `Production Users (${counts.production})` },
  ];
  if (showQa) {
    optionsList.push(
      { id: "qa_test", label: `QA Users (${counts.qa})` },
      { id: "probe_debug", label: `Probe / Debug Users (${counts.probe})` }
    );
  }
  optionsList.push(
    { id: "inactive", label: `Inactive (${counts.inactive})` },
    { id: "with_labs", label: "With Assigned Labs" },
    { id: "without_labs", label: "Without Assigned Labs" },
    { id: "awaiting_provisioning", label: "Awaiting Provisioning" }
  );
  return optionsList;
}

export const DIRECTORY_AUDIENCE_FILTERS = [
  { id: "", label: "All Users" },
  { id: "real", label: "Production Users" },
  { id: "qa_test", label: "QA Users" },
  { id: "probe_debug", label: "Probe / Debug Users" },
  { id: "inactive", label: "Inactive" },
  { id: "with_labs", label: "With Assigned Labs" },
  { id: "without_labs", label: "Without Assigned Labs" },
];

/** Default audience — production users in daily ops; all users when QA complexity is shown. */
export const DIRECTORY_DEFAULT_AUDIENCE = getDirectoryDefaultAudience();

/** Active login-enabled users missing credentials or scope assignment (read-only directory signal). */
export function isUserAwaitingProvisioning(user = {}) {
  if (user.active === false) return false;
  if (!user.loginEnabled) return false;
  const missingCredentials = !str(user.email) || user.hasStoredEmail === false;
  const role = normalizePlatformRole(user.role);
  const missingAssignment =
    (isAgentRole(role) || role === ROLES.LAB) && (Number(user.assignedLabsCount) || 0) === 0;
  return missingCredentials || missingAssignment;
}

export function countUsersAwaitingProvisioning(users = []) {
  return (users || []).filter(isUserAwaitingProvisioning).length;
}

export function filterDirectoryUsers(users = [], filters = {}) {
  const roleFilter = str(filters.role).toLowerCase();
  const statusFilter = str(filters.status).toLowerCase();
  const audienceFilter = str(filters.audience).toLowerCase();
  const distributorFilter = str(filters.distributorId);
  const search = str(filters.search);

  return users.filter((user) => {
    const userClass = classifyDirectoryUser(user);
    const labs = Number(user.assignedLabsCount) || 0;

    if (audienceFilter === "real" && userClass !== USER_DIRECTORY_CLASS.REAL) return false;
    if (audienceFilter === "qa_test" && userClass !== USER_DIRECTORY_CLASS.QA_TEST) return false;
    if (audienceFilter === "probe_debug" && userClass !== USER_DIRECTORY_CLASS.PROBE_DEBUG) return false;
    if (audienceFilter === "inactive" && user.active !== false) return false;
    if (audienceFilter === "with_labs" && labs <= 0) return false;
    if (audienceFilter === "without_labs" && labs > 0) return false;
    if (audienceFilter === "awaiting_provisioning" && !isUserAwaitingProvisioning(user)) return false;

    if (roleFilter && normalizePlatformRole(user.role) !== roleFilter) return false;
    if (statusFilter === "active" && user.active === false) return false;
    if (statusFilter === "inactive" && user.active !== false) return false;
    if (distributorFilter && str(user.distributorId) !== distributorFilter) return false;
    if (
      !matchesSearch(search, [
        user.name,
        user.displayName,
        user.username,
        user.email,
        user.phone,
        user.roleLabel,
        user.role,
        user.userClassLabel,
        user.distributorName,
        user.distributorId,
        user.territory,
        user.tenantId,
        user.agentId,
        user.labId,
      ])
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Role-aware directory row actions (presentation only).
 */
export function resolveDirectoryRowActions(user = {}, { allowProbeActions = false } = {}) {
  const role = normalizePlatformRole(user.role);
  const userClass = classifyDirectoryUser(user);
  const isProbe = userClass === USER_DIRECTORY_CLASS.PROBE_DEBUG;
  const canReset =
    user.loginEnabled && user.hasStoredEmail !== false && Boolean(str(user.email));

  if (isProbe && !allowProbeActions) {
    return {
      review: true,
      assign: false,
      assignLab: false,
      transferLab: false,
      resetPassword: false,
      deactivate: false,
      reactivate: false,
      probeRestricted: true,
    };
  }

  const base = {
    review: true,
    assign: false,
    assignLab: false,
    transferLab: false,
    resetPassword: canReset,
    deactivate: user.active !== false,
    reactivate: user.active === false,
    probeRestricted: false,
  };

  if (isAgentRole(role)) {
    return {
      ...base,
      assign: true,
      transferLab: true,
    };
  }

  if (role === ROLES.LAB) {
    return {
      ...base,
      assignLab: true,
    };
  }

  if (
    role === ROLES.ADMIN ||
    role === ROLES.EXECUTIVE ||
    role === ROLES.DISTRIBUTOR_ADMIN ||
    role === ROLES.DISTRIBUTOR_MANAGER ||
    role === ROLES.READ_ONLY_AUDITOR
  ) {
    return base;
  }

  return base;
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
      case "lastLogin":
        av = new Date(a.lastLoginAt || 0).getTime();
        bv = new Date(b.lastLoginAt || 0).getTime();
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
  const eventType = str(row.event_type ?? row.eventType).toLowerCase();
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const payloadAction = str(payload.action).toLowerCase();
  const actionKey =
    eventType === "updated" && payloadAction ? payloadAction : eventType || payloadAction;

  return {
    id: str(row.id),
    eventType,
    actionKey,
    subjectUserId: str(row.subject_user_id ?? row.subjectUserId),
    subjectName: userNameById.get(str(row.subject_user_id)) || str(row.subject_user_id).slice(0, 8),
    actorUserId: str(row.actor_user_id ?? row.actorUserId),
    payload,
    createdAt: row.created_at ?? row.createdAt,
    timestamp: row.created_at ?? row.createdAt,
  };
}

/** Standard provisioning audit payload (Phase 3B). */
export function buildProvisioningAuditPayload({
  action = "",
  reason = "",
  previous = {},
  next = {},
  related = {},
  meta = {},
} = {}) {
  const base = {
    schemaVersion: 1,
    status: "success",
    recordedAt: new Date().toISOString(),
  };
  const actionKey = str(action);
  if (actionKey) base.action = actionKey;
  const reasonText = str(reason);
  if (reasonText) base.reason = reasonText;
  if (previous && Object.keys(previous).length > 0) base.previous = previous;
  if (next && Object.keys(next).length > 0) base.next = next;
  return { ...base, ...related, ...meta };
}

export const PROVISIONING_AUDIT_EVENT_TYPES = new Set([
  "created",
  "updated",
  "deactivated",
  "reactivated",
  "lab_transferred",
  "password_reset",
  "role_changed",
  "ownership_reassigned",
  "ownership_assigned",
  "ownership_transferred",
  "ownership_removed",
  "ownership_secondary_added",
  "ownership_secondary_removed",
]);

/**
 * Pre–Phase 3B audit rows (no schemaVersion / recordedAt envelope).
 * @param {object} payload
 */
export function isLegacyProvisioningAuditPayload(payload = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  if (p.schemaVersion === 1) return false;
  const hasPhase3BEnvelope =
    Boolean(str(p.recordedAt)) && (Boolean(str(p.status)) || p.success !== undefined);
  return !hasPhase3BEnvelope;
}

/**
 * Validate a single provisioning audit payload shape for Predator / integrity checks.
 * @param {string} eventType
 * @param {object} payload
 */
export function validateProvisioningEventPayload(eventType, payload = {}) {
  const type = str(eventType).toLowerCase();
  const p = payload && typeof payload === "object" ? payload : {};
  if (isLegacyProvisioningAuditPayload(p)) {
    return { valid: true, issues: [], legacy: true };
  }
  const issues = [];

  if (p.schemaVersion !== 1 && type !== "created" && type !== "deactivated" && type !== "reactivated") {
    issues.push("missing_or_invalid_schemaVersion");
  }
  if (!str(p.status) && p.success === undefined) {
    issues.push("missing_status");
  }

  if (type === "role_changed") {
    const prevRole = str(p.previous?.role ?? p.fromRole);
    const nextRole = str(p.next?.role ?? p.toRole);
    if (!prevRole || !nextRole) issues.push("role_changed_missing_previous_or_next");
  }

  if (type === "password_reset") {
    if (!str(p.method)) issues.push("password_reset_missing_method");
  }

  if (type === "ownership_reassigned" || type === "ownership_assigned" || type === "ownership_transferred") {
    if (!str(p.labId ?? p.lab_id)) issues.push("ownership_missing_labId");
    if (
      type !== "ownership_removed" &&
      !str(p.toAgentId ?? p.to_agent_id) &&
      !str(p.next?.agentId) &&
      !str(p.primaryAgentId ?? p.primary_agent_id)
    ) {
      issues.push("ownership_missing_toAgent");
    }
  }

  if (type === "ownership_removed") {
    if (!str(p.labId ?? p.lab_id)) issues.push("ownership_missing_labId");
  }

  if (type === "ownership_secondary_added" || type === "ownership_secondary_removed") {
    if (!str(p.labId ?? p.lab_id)) issues.push("ownership_missing_labId");
    if (!str(p.secondaryAgentId ?? p.secondary_agent_id)) issues.push("ownership_missing_secondary");
  }

  if (type === "created") {
    if (!str(p.role) && !str(p.email)) issues.push("created_missing_role_or_email");
  }

  return { valid: issues.length === 0, issues, eventType: type };
}

export function formatLastLogin(value) {
  if (!value) return "Never";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "Never";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (d >= startOfToday) {
    const diffMs = now.getTime() - d.getTime();
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 1) {
      const minutes = Math.floor(diffMs / 60000);
      if (minutes <= 1) return "Just now";
      return `${minutes} minutes ago`;
    }
    if (hours === 1) return "1 hour ago";
    if (hours < 12) return `${hours} hours ago`;
    return "Today";
  }

  if (d >= startOfYesterday) return "Yesterday";

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
