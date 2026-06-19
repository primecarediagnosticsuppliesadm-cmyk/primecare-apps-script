import { ROLE_LABELS, ROLES } from "@/config/roles.js";

function str(v) {
  return String(v ?? "").trim();
}

export const OPERATIONS_CENTER_TABS = [
  { id: "agents", label: "Agents" },
  { id: "users", label: "Users" },
  { id: "labAssignment", label: "Lab Assignment" },
];

export const PLATFORM_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "executive", label: "Executive" },
  { value: "agent", label: "Agent" },
  { value: "lab", label: "Lab User" },
];

export function normalizePlatformRole(role) {
  const r = str(role).toLowerCase();
  if (r === "lab user") return ROLES.LAB;
  if ([ROLES.AGENT, ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB].includes(r)) return r;
  return PLATFORM_ROLE_OPTIONS.some((o) => o.value === r) ? r : "";
}

export function isAgentRole(role) {
  return normalizePlatformRole(role) === ROLES.AGENT;
}

export function platformRoleLabel(role) {
  const normalized = normalizePlatformRole(role);
  return ROLE_LABELS[normalized] || str(role) || "—";
}

export const EMAIL_NOT_ADDED = "Email not added";

export const RESET_PASSWORD_EMAIL_MISSING = "Add email first";

export function deriveDisplayNameFromEmail(email) {
  const local = str(email).split("@")[0];
  if (!local) return "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolvePlatformUserDisplayName({
  agentName = "",
  directoryName = "",
  email = "",
  role = "",
  userId = "",
} = {}) {
  const fromDirectory = str(directoryName);
  if (fromDirectory) return fromDirectory;
  const fromProfile = str(agentName);
  if (fromProfile) return fromProfile;
  const fromEmail = deriveDisplayNameFromEmail(email);
  if (fromEmail) return fromEmail;
  const roleLabel = platformRoleLabel(role);
  if (roleLabel && roleLabel !== "—") return roleLabel;
  const id = str(userId);
  if (id) return `User ${id.slice(0, 8)}`;
  return "—";
}

export function directoryRoleFromPlatformRole(role) {
  const normalized = normalizePlatformRole(role);
  if (normalized === ROLES.LAB) return "LAB";
  if (normalized === ROLES.AGENT) return "AGENT";
  if (normalized === ROLES.ADMIN) return "ADMIN";
  if (normalized === ROLES.EXECUTIVE) return "EXECUTIVE";
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
    name: str(row.agent_name ?? row.user_name ?? row.name),
    email: str(row.email),
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
    name: str(user.name),
    email: str(user.email),
    phone: "",
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
  const role = normalizePlatformRole(row.role);
  const email = str(row.email);
  const name = resolvePlatformUserDisplayName({
    agentName: row.agent_name ?? row.agentName,
    directoryName: row.user_name ?? row.directoryName,
    email,
    role,
    userId: row.user_id ?? row.userId,
  });
  return {
    userId: str(row.user_id ?? row.userId),
    name,
    email,
    role,
    roleLabel: platformRoleLabel(role),
    active: row.active !== false,
    createdAt: row.created_at ?? row.createdAt ?? null,
    tenantId: str(row.tenant_id ?? row.tenantId),
    agentId: str(row.agent_id ?? row.agentId),
    labId: str(row.lab_id ?? row.labId),
  };
}

export function mapLabAssignmentRow(row = {}) {
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
  return {
    labId: str(row.labId ?? row.lab_id),
    labName: str(row.labName ?? row.lab_name) || str(row.labId ?? row.lab_id),
    assignedAgentId: agentId,
    assignedAgentName: agentName,
    tenantId: str(row.tenantId ?? row.tenant_id),
  };
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
