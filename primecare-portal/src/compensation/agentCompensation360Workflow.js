/**
 * Phase 5B Agent Compensation 360 workflow.
 * Pure domain helpers — no Supabase I/O.
 */

export const AGENT_COMP_360_SECTIONS = Object.freeze([
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

export function agentCompensation360Permissions(role) {
  const key = roleKey(role);
  return {
    role: key,
    canView360: ["executive", "hr", "admin", "agent"].includes(key),
    canChangePlan: ["executive", "hr"].includes(key),
    canReviewHistory: ["executive", "hr", "admin"].includes(key),
    agentOwnProfileOnly: key === "agent",
    adminReadOnly: key === "admin",
    hrNoRuleEditing: key === "hr",
  };
}

export function assertAgentCompensation360Access(
  role,
  { actorAgentId, targetAgentId, actorProfileUserId, targetProfileUserId } = {}
) {
  const perms = agentCompensation360Permissions(role);
  if (!perms.canView360) {
    throw new Error(`agent_comp_360_forbidden:${roleKey(role)}`);
  }
  if (perms.agentOwnProfileOnly) {
    const ownAgent = str(actorAgentId) && str(actorAgentId) === str(targetAgentId);
    const ownProfile =
      actorProfileUserId &&
      targetProfileUserId &&
      str(actorProfileUserId) === str(targetProfileUserId);
    if (!ownAgent && !ownProfile) {
      throw new Error("agent_comp_360_own_profile_only");
    }
  }
  if (!str(targetAgentId)) {
    throw new Error("agent_comp_360_agent_id_required");
  }
  return true;
}

export function auditEventMatchesAgent(event = {}, agentId) {
  const target = str(agentId);
  if (!target) return false;
  const after = event.after_json || {};
  const before = event.before_json || {};
  const metadata = event.metadata || {};
  const haystack = [
    after.agent_id,
    before.agent_id,
    metadata.agent_id,
    after.agentId,
    before.agentId,
    event.entity_id,
    event.reason,
    JSON.stringify(after),
    JSON.stringify(before),
  ]
    .map(str)
    .join(" ");
  return haystack.includes(target);
}
