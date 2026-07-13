import { isNonProductionDirectoryUser } from "../../operations/userDirectoryClassification.js";
import { str } from "./analyticsFormatters.js";

const AUTOMATION_NAME_RE = /\b(smoke|automation|system\s+account)\b/i;
const QA_FIXTURE_NAME_RE = /\bqa\s+(test\s+)?agent\b/i;
const PROBE_NAME_RE = /\b(probe|debug)\b/i;

function profileFromMaps(profileUserId, { profileById = new Map(), profileByAgentId = new Map() } = {}) {
  const byId = profileById.get(str(profileUserId));
  if (byId) return byId;
  return null;
}

function lineDisplayName(line = {}) {
  return str(line.employee_name || line.agent_name);
}

/**
 * Exclude probe/smoke/automation/QA fixture identities from executive analytics.
 * Real Admin, Executive, and HR profiles remain visible.
 */
export function isExcludedFromExecutiveAnalytics(
  { profile = null, line = null, profileUserId = null, agentId = null } = {},
  maps = {}
) {
  const resolvedProfile =
    profile ||
    (profileUserId ? profileFromMaps(profileUserId, maps) : null) ||
    (agentId ? maps.profileByAgentId?.get(str(agentId)) : null);

  if (resolvedProfile && isNonProductionDirectoryUser(resolvedProfile)) {
    return true;
  }

  const name = lineDisplayName(line) || str(resolvedProfile?.display_name || resolvedProfile?.agent_name);
  if (PROBE_NAME_RE.test(name) || AUTOMATION_NAME_RE.test(name) || QA_FIXTURE_NAME_RE.test(name)) {
    return true;
  }

  const email = str(resolvedProfile?.email).toLowerCase();
  if (email && (email.includes("probe") || email.includes("smoke") || email.includes("automation"))) {
    return true;
  }

  return false;
}

export function filterAnalyticsLines(lines = [], { profiles = [] } = {}) {
  const profileById = new Map((profiles || []).map((row) => [str(row.user_id), row]));
  const profileByAgentId = new Map(
    (profiles || []).filter((row) => str(row.agent_id)).map((row) => [str(row.agent_id), row])
  );
  const maps = { profileById, profileByAgentId };

  return (lines || []).filter((line) => {
    return !isExcludedFromExecutiveAnalytics(
      {
        line,
        profileUserId: line.profile_user_id,
        agentId: line.agent_id,
      },
      maps
    );
  });
}

export function buildProfileMaps(profiles = []) {
  return {
    profileById: new Map((profiles || []).map((row) => [str(row.user_id), row])),
    profileByAgentId: new Map(
      (profiles || []).filter((row) => str(row.agent_id)).map((row) => [str(row.agent_id), row])
    ),
  };
}
