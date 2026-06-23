/**
 * HQ lab agent resolution — single source of truth for all command-center modules.
 * Resolves agent id + display name from lab/collection rows and Operations Center directory.
 */

function str(v) {
  return String(v ?? "").trim();
}

/** Agent business id from a lab or collection row. */
export function labAssignedAgentId(lab) {
  const row = lab ?? {};
  return str(
    row.assignedAgentId ??
      row.assigned_agent_id ??
      row.agentId ??
      row.agent_id
  );
}

/** Display name already present on the row, if any. */
export function labAssignedAgentNameRaw(lab) {
  const row = lab ?? {};
  return str(
    row.assignedAgent ??
      row.assigned_agent ??
      row.assignedAgentName ??
      row.assigned_agent_name ??
      row.agent_name ??
      row.agentName
  );
}

/** Map agent/user ids → display names from Operations Center directory or agents list. */
export function buildAgentDisplayNameLookup(users = []) {
  const map = new Map();
  for (const user of users) {
    const name = str(
      user.displayName ?? user.name ?? user.agentName ?? user.display_name
    );
    if (!name) continue;
    for (const key of [user.agentId, user.userId, user.id, user.agent_id, user.user_id]) {
      const k = str(key).toLowerCase();
      if (k && !map.has(k)) map.set(k, name);
    }
  }
  return map;
}

/**
 * Resolve assigned field agent for a lab or collection row.
 * @returns {{ agentId: string, agentName: string, isAssigned: boolean, displayLabel: string }}
 */
export function resolveLabAgent(lab, directoryUsers = []) {
  const row = lab ?? {};
  const agentId = labAssignedAgentId(row);
  const rawName = labAssignedAgentNameRaw(row);
  const lookup = buildAgentDisplayNameLookup(directoryUsers);
  const resolvedName =
    rawName || (agentId ? lookup.get(agentId.toLowerCase()) || "" : "");
  const isAssigned = Boolean(agentId || resolvedName);

  return {
    agentId,
    agentName: resolvedName,
    isAssigned,
    displayLabel: resolvedName || (agentId ? agentId : "Unassigned"),
  };
}

/** Resolve agent for a lab id against a list of lab/assignment rows. */
export function resolveLabAgentForLabId(labId, labRows = [], directoryUsers = []) {
  const key = str(labId).toLowerCase();
  if (!key) return resolveLabAgent({}, directoryUsers);

  const lab = (labRows || []).find(
    (row) => str(row.labId ?? row.lab_id).toLowerCase() === key
  );
  return resolveLabAgent(lab || { labId }, directoryUsers);
}

/** labId (lowercase) → resolveLabAgent() result */
export function buildLabAgentLookupByLabId(labRows = [], directoryUsers = []) {
  const map = new Map();
  for (const lab of labRows || []) {
    const labId = str(lab.labId ?? lab.lab_id).toLowerCase();
    if (!labId) continue;
    map.set(labId, resolveLabAgent(lab, directoryUsers));
  }
  return map;
}

export function isLabAssigned(lab, directoryUsers = []) {
  return resolveLabAgent(lab, directoryUsers).isAssigned;
}

/** @deprecated Use resolveLabAgent().agentName */
export function resolveLabAssignedAgentName(lab, directoryUsers = []) {
  return resolveLabAgent(lab, directoryUsers).agentName;
}

/** @deprecated Use resolveLabAgent().agentName (empty when unassigned) */
export function resolveLabAssignedAgentDisplay(lab, directoryUsers = []) {
  return resolveLabAgent(lab, directoryUsers).agentName;
}
