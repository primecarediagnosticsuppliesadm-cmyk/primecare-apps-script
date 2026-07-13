/**
 * Phase 7.1 — Employee Compensation 360 workflow.
 * Profile-primary enterprise compensation profile access.
 */

export const EMPLOYEE_COMP_360_SECTIONS = Object.freeze([
  "overview",
  "payrollHistory",
  "commissionHistory",
  "compensationPlan",
  "adjustments",
  "promotion",
  "auditTimeline",
]);

function str(value) {
  return String(value ?? "").trim();
}

function roleKey(role) {
  return str(role).toLowerCase();
}

export function employeeCompensation360Permissions(role) {
  const key = roleKey(role);
  return {
    role: key,
    canView360: ["executive", "hr", "admin", "agent"].includes(key),
    canChangePlan: ["executive", "hr"].includes(key),
    canAssignPlan: ["executive", "hr"].includes(key),
    canReviewHistory: ["executive", "hr", "admin"].includes(key),
    employeeOwnProfileOnly: key === "agent",
    adminReadOnly: key === "admin",
    hrNoRuleEditing: key === "hr",
  };
}

export function assertEmployeeCompensation360Access(
  role,
  { actorAgentId, targetAgentId, actorProfileUserId, targetProfileUserId } = {}
) {
  const perms = employeeCompensation360Permissions(role);
  if (!perms.canView360) {
    throw new Error(`employee_comp_360_forbidden:${roleKey(role)}`);
  }
  if (perms.employeeOwnProfileOnly) {
    const ownAgent = str(actorAgentId) && str(actorAgentId) === str(targetAgentId);
    const ownProfile =
      actorProfileUserId &&
      targetProfileUserId &&
      str(actorProfileUserId) === str(targetProfileUserId);
    if (!ownAgent && !ownProfile) {
      throw new Error("employee_comp_360_own_profile_only");
    }
  }
  if (!str(targetProfileUserId) && !str(targetAgentId)) {
    throw new Error("employee_comp_360_identity_required");
  }
  return true;
}

export function auditEventMatchesEmployee(event = {}, { profileUserId, agentId } = {}) {
  const profile = str(profileUserId);
  const agent = str(agentId);
  const after = event.after_json || {};
  const before = event.before_json || {};
  const metadata = event.metadata || {};
  const haystack = [
    after.profile_user_id,
    before.profile_user_id,
    metadata.profile_user_id,
    after.agent_id,
    before.agent_id,
    metadata.agent_id,
    JSON.stringify(after),
    JSON.stringify(before),
    JSON.stringify(metadata),
  ]
    .map(str)
    .join(" ");
  if (profile && haystack.includes(profile)) return true;
  if (agent && haystack.includes(agent)) return true;
  return false;
}

export function sectionsForEmployeeRole(employeeRole) {
  const role = roleKey(employeeRole);
  const sections = ["overview", "payrollHistory", "compensationPlan", "adjustments", "auditTimeline"];
  if (role === "agent") {
    sections.splice(2, 0, "commissionHistory", "promotion");
  }
  return sections;
}

/** @deprecated Use employeeCompensation360Permissions */
export const agentCompensation360Permissions = employeeCompensation360Permissions;

/** @deprecated Use assertEmployeeCompensation360Access */
export const assertAgentCompensation360Access = assertEmployeeCompensation360Access;

/** @deprecated Use auditEventMatchesEmployee */
export function auditEventMatchesAgent(event = {}, agentId) {
  return auditEventMatchesEmployee(event, { agentId });
}
