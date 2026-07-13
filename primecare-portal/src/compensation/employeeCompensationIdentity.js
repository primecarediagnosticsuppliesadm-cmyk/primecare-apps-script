/**
 * Phase 7.1 — Employee identity helpers for enterprise compensation.
 * Profile is primary; agent_id is specialization for field agents only.
 */

function str(value) {
  return String(value ?? "").trim();
}

export function employeeKey(row = {}) {
  const profileUserId = str(row.profileUserId ?? row.profile_user_id);
  const agentId = str(row.agentId ?? row.agent_id);
  if (profileUserId) return `profile:${profileUserId}`;
  if (agentId) return `agent:${agentId}`;
  return "";
}

export function employeeDisplayName(row = {}) {
  return (
    str(row.employee_name ?? row.employeeName) ||
    str(row.agent_name ?? row.agentName) ||
    str(row.display_name ?? row.displayName) ||
    str(row.agent_id ?? row.agentId) ||
    "—"
  );
}

export function resolveEmployeeRole(row = {}) {
  return str(row.employee_role ?? row.employeeRole ?? row.role ?? "agent").toLowerCase();
}

export function profileDisplayName(profile = {}) {
  return (
    str(profile.agent_name) ||
    str(profile.display_name) ||
    str(profile.username) ||
    str(profile.email) ||
    str(profile.user_id)
  );
}

export function assignmentIdentityPayload(profile = {}) {
  const role = resolveEmployeeRole(profile);
  const profileUserId = profile.user_id || profile.userId || null;
  const agentId = role === "agent" ? str(profile.agent_id ?? profile.agentId) : "";
  if (!profileUserId) throw new Error("profile_user_id_required");
  if (role === "agent" && !agentId) throw new Error("agent_id_required_for_agent_role");
  return {
    profile_user_id: profileUserId,
    agent_id: agentId || null,
    employee_name: profileDisplayName(profile),
    employee_role: role,
    agent_name: role === "agent" ? profileDisplayName(profile) : null,
  };
}
