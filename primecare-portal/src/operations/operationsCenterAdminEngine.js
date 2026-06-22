import { ROLE_LABELS, ROLES } from "@/config/roles.js";

function str(v) {
  return String(v ?? "").trim();
}

export const OPERATIONS_CENTER_TABS = [
  { id: "directory", label: "User Directory" },
  { id: "labAssignment", label: "Bulk Lab Assign" },
  { id: "distributorAssignment", label: "Bulk Distributor Assign" },
];

export const PLATFORM_ROLE_OPTIONS = [
  { value: "admin", label: "HQ Admin" },
  { value: "executive", label: "Executive" },
  { value: "agent", label: "Agent" },
  { value: "lab", label: "Lab User" },
  { value: "distributor_admin", label: "Distributor Admin" },
];

const KNOWN_PLATFORM_ROLES = new Set([
  ROLES.AGENT,
  ROLES.ADMIN,
  ROLES.EXECUTIVE,
  ROLES.LAB,
  ROLES.DISTRIBUTOR_ADMIN,
]);

export function normalizePlatformRole(role) {
  const r = str(role).toLowerCase();
  if (r === "lab user") return ROLES.LAB;
  if (KNOWN_PLATFORM_ROLES.has(r)) return r;
  return PLATFORM_ROLE_OPTIONS.some((o) => o.value === r) ? r : "";
}

export function isAgentRole(role) {
  return normalizePlatformRole(role) === ROLES.AGENT;
}

export function platformRoleLabel(role) {
  const normalized = normalizePlatformRole(role);
  return ROLE_LABELS[normalized] || str(role) || "—";
}

export const EMAIL_NOT_ADDED = "Contact email not added";

export const RESET_PASSWORD_EMAIL_MISSING = "Add contact email first";

/** Email stored on public.profiles (canonical for Reset Password). */
export function resolveStoredPlatformUserEmail({ profileEmail = "" } = {}) {
  return str(profileEmail);
}

export function resolvePlatformUserDisplayName({
  displayName = "",
  agentName = "",
  directoryName = "",
  profileEmail = "",
  role = "",
} = {}) {
  const fromDisplay = str(displayName);
  if (fromDisplay) return fromDisplay;
  const fromAgent = str(agentName);
  if (fromAgent) return fromAgent;
  const fromDirectory = str(directoryName);
  if (fromDirectory) return fromDirectory;
  const fromEmail = deriveDisplayNameFromEmail(profileEmail);
  if (fromEmail) return fromEmail;
  const roleLabel = platformRoleLabel(role);
  if (roleLabel && roleLabel !== "—") return roleLabel;
  return "User";
}

export function resolvePlatformUserContact(row = {}) {
  const role = normalizePlatformRole(row.role);
  const profileEmail = str(row.profile_email ?? row.profileEmail ?? row.email);
  const storedEmail = resolveStoredPlatformUserEmail({ profileEmail });

  const name = resolvePlatformUserDisplayName({
    displayName: row.display_name ?? row.displayName,
    agentName: row.agent_name ?? row.agentName,
    directoryName: row.user_name ?? row.directoryName ?? row.userName,
    profileEmail,
    role,
  });

  return {
    name,
    displayName: name,
    username: str(row.username),
    email: storedEmail,
    storedEmail,
    hasStoredEmail: Boolean(storedEmail),
    phone: str(row.phone),
    role,
  };
}

export function deriveDisplayNameFromEmail(email) {
  const local = str(email).split("@")[0];
  if (!local) return "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function directoryRoleFromPlatformRole(role) {
  const normalized = normalizePlatformRole(role);
  if (normalized === ROLES.LAB) return "LAB";
  if (normalized === ROLES.AGENT) return "AGENT";
  if (normalized === ROLES.ADMIN) return "ADMIN";
  if (normalized === ROLES.EXECUTIVE) return "EXECUTIVE";
  if (normalized === ROLES.DISTRIBUTOR_ADMIN) return "DISTRIBUTOR_ADMIN";
  return str(role).toUpperCase();
}

export function formatOpsDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return str(value).slice(0, 10) || "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function mapOperationsAgentRow(row = {}) {
  const userId = str(row.user_id ?? row.userId);
  const fromProfile = Boolean(userId);
  return {
    id: fromProfile ? userId : str(row.id),
    userId: userId || null,
    agentId: str(row.agent_id ?? row.agentId ?? row.user_code),
    name: str(row.display_name ?? row.displayName ?? row.agent_name ?? row.user_name ?? row.name),
    email: str(row.profile_email ?? row.email),
    phone: str(row.phone ?? row.lab_id),
    active: row.active !== false,
    createdAt: row.created_at ?? row.createdAt ?? null,
    tenantId: str(row.tenant_id ?? row.tenantId),
    source: fromProfile ? "profile" : "users",
  };
}

/** Map a platform user profile row to the Agents tab shape. */
export function platformUserToAgentRow(user = {}) {
  return {
    id: str(user.userId),
    userId: str(user.userId),
    agentId: str(user.agentId) || str(user.userId),
    name: str(user.displayName ?? user.name),
    email: str(user.storedEmail ?? user.email),
    phone: str(user.phone),
    active: user.active !== false,
    createdAt: user.createdAt ?? null,
    tenantId: str(user.tenantId),
    source: "profile",
  };
}

export function deriveAgentsFromPlatformUsers(users = []) {
  return users.filter((u) => isAgentRole(u.role)).map(platformUserToAgentRow);
}

export function countActiveAgents(agents = []) {
  return agents.filter((a) => a.active !== false).length;
}

export function mapPlatformUserRow(row = {}) {
  const { name, displayName, email, storedEmail, hasStoredEmail, phone, role } =
    resolvePlatformUserContact(row);
  const userId = str(row.user_id ?? row.userId);
  return {
    userId,
    name,
    displayName,
    username: str(row.username),
    email,
    storedEmail,
    hasStoredEmail,
    phone,
    userIdShort: userId ? userId.slice(0, 8) : "",
    role,
    roleLabel: platformRoleLabel(role),
    active: row.active !== false,
    createdAt: row.created_at ?? row.createdAt ?? null,
    tenantId: str(row.tenant_id ?? row.tenantId),
    agentId: str(row.agent_id ?? row.agentId),
    labId: str(row.lab_id ?? row.labId),
    distributorId: str(row.distributor_id ?? row.distributorId),
    territory: str(row.territory),
  };
}

export function mapLabAssignmentRow(row = {}, tenantNameById = new Map()) {
  const agentId = str(
    row.assignedAgentId ??
      row.assigned_agent_id ??
      row.agentId ??
      row.agent_id
  );
  const agentName = str(
    row.assignedAgent ??
      row.assigned_agent ??
      row.agentName ??
      row.agent_name
  );
  const tenantId = str(row.tenantId ?? row.tenant_id);
  const status = str(row.status ?? row.activeFlag) || "—";
  return {
    labId: str(row.labId ?? row.lab_id),
    labName: str(row.labName ?? row.lab_name) || str(row.labId ?? row.lab_id),
    assignedAgentId: agentId,
    assignedAgentName: agentName,
    tenantId,
    tenantName: str(row.tenantName ?? row.tenant_name) || tenantNameById.get(tenantId) || tenantId,
    status,
    active: row.active !== false && str(row.activeFlag).toLowerCase() !== "inactive",
  };
}

/** Stable key for lab assignment UI and diffing. */
export function labAssignmentKey(lab = {}) {
  return `${str(lab.tenantId ?? lab.tenant_id)}::${str(lab.labId ?? lab.lab_id)}`;
}

/** Fill missing assignedAgentName when v_labs_credit omits agent_name. */
export function enrichLabAssignmentsWithAgentNames(labs = [], agents = []) {
  const nameByAgentKey = new Map();
  for (const agent of agents) {
    const name = str(agent.name ?? agent.displayName);
    if (!name) continue;
    for (const key of [agent.agentId, agent.userId, agent.id]
      .map((v) => str(v).toLowerCase())
      .filter(Boolean)) {
      if (!nameByAgentKey.has(key)) nameByAgentKey.set(key, name);
    }
  }

  return labs.map((lab) => {
    if (str(lab.assignedAgentName)) return lab;
    const derived = nameByAgentKey.get(str(lab.assignedAgentId).toLowerCase());
    return derived ? { ...lab, assignedAgentName: derived } : lab;
  });
}

export function mapDistributorAssignmentRow(row = {}, options = {}) {
  const distributorId = str(row.distributorId ?? row.distributor_id ?? row.id);
  const tenantNameById = options.tenantNameById || new Map();
  const labCountByDistributor = options.labCountByDistributor || new Map();
  return {
    distributorId,
    distributorCode: str(row.distributorCode ?? row.tenant_code),
    distributorName: str(row.distributorName ?? row.tenant_name ?? row.name) || distributorId,
    status: str(row.status) || "ACTIVE",
    assignedAgentUserId: str(row.assignedAgentUserId ?? row.agent_user_id),
    assignedAgentName: str(row.assignedAgentName ?? row.agent_name),
    assignmentId: str(row.assignmentId ?? row.assignment_id ?? row.id),
    labCount: labCountByDistributor.get(distributorId) || 0,
    tenantId: str(row.tenantId ?? row.tenant_id),
  };
}

export function countLabsByDistributor(labs = []) {
  const counts = new Map();
  for (const lab of labs) {
    const key = str(lab.tenantId ?? lab.tenant_id);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function enrichAgentsWithAssignmentCounts(agents = [], labs = [], distributors = []) {
  const labCountByAgentKey = new Map();
  const distCountByAgentKey = new Map();

  for (const lab of labs) {
    const agentKey = str(lab.assignedAgentId).toLowerCase();
    if (!agentKey) continue;
    labCountByAgentKey.set(agentKey, (labCountByAgentKey.get(agentKey) || 0) + 1);
  }

  for (const dist of distributors) {
    const agentKey = str(dist.assignedAgentUserId).toLowerCase();
    if (!agentKey) continue;
    distCountByAgentKey.set(agentKey, (distCountByAgentKey.get(agentKey) || 0) + 1);
  }

  return agents.map((agent) => {
    const keys = [
      str(agent.userId).toLowerCase(),
      str(agent.agentId).toLowerCase(),
      str(agent.id).toLowerCase(),
    ].filter(Boolean);
    let assignedLabsCount = 0;
    let assignedDistributorsCount = 0;
    for (const key of keys) {
      assignedLabsCount = Math.max(assignedLabsCount, labCountByAgentKey.get(key) || 0);
      assignedDistributorsCount = Math.max(
        assignedDistributorsCount,
        distCountByAgentKey.get(key) || 0
      );
    }
    return { ...agent, assignedLabsCount, assignedDistributorsCount };
  });
}

export function labsForAgent(agent, labs = []) {
  const keys = new Set(
    [agent?.userId, agent?.agentId, agent?.id].map((v) => str(v).toLowerCase()).filter(Boolean)
  );
  return labs.filter((lab) => keys.has(str(lab.assignedAgentId).toLowerCase()));
}

export function distributorsForAgent(agent, distributors = []) {
  const keys = new Set(
    [agent?.userId, agent?.agentId, agent?.id].map((v) => str(v).toLowerCase()).filter(Boolean)
  );
  return distributors.filter((dist) => keys.has(str(dist.assignedAgentUserId).toLowerCase()));
}

export function agentDisplayLabel(agent) {
  if (!agent) return "—";
  return agent.name || agent.agentId || "—";
}

export function matchesSearch(query, fields = []) {
  const q = str(query).toLowerCase();
  if (!q) return true;
  return fields.some((f) => str(f).toLowerCase().includes(q));
}
