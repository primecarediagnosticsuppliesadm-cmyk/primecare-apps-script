import { ROLES } from "@/config/roles";
import { labIdKey, normalizeAgentIdKey } from "@/utils/labId";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function profileAgentId(currentUser) {
  return normalizeAgentIdKey(currentUser?.agentId || currentUser?.agent_id);
}

function profileAgentName(currentUser) {
  return normalize(
    currentUser?.agentName || currentUser?.name || currentUser?.userName
  );
}

export function canSeeAllData(currentUser) {
  return (
    currentUser?.role === ROLES.ADMIN ||
    currentUser?.role === ROLES.EXECUTIVE
  );
}

/**
 * Agent scope: match profiles.agent_id first, then agent_name / display name.
 */
export function agentRecordMatchesUser(recordAgentId, recordAgentName, currentUser) {
  if (!currentUser || currentUser.role !== ROLES.AGENT) return false;

  const profileId = profileAgentId(currentUser);
  const profileName = profileAgentName(currentUser);
  const rowId = normalizeAgentIdKey(recordAgentId);
  const rowName = normalize(recordAgentName);

  if (profileId && rowId && profileId === rowId) {
    return true;
  }
  if (profileName && rowName && profileName === rowName) {
    return true;
  }
  return false;
}

/** No-op: lab filter diagnostics removed after B2 QA. */
export function logAgentLabFilterDebug() {}

export function filterVisitsForUser(visits = [], currentUser) {
  if (!currentUser) return [];

  if (canSeeAllData(currentUser)) return visits;

  if (currentUser.role === ROLES.AGENT) {
    return visits.filter((visit) =>
      agentRecordMatchesUser(
        visit.agentId || visit.agent_id,
        visit.agent || visit.agentName || visit.Agent_Name,
        currentUser
      )
    );
  }

  return [];
}

export function filterLabsForUser(labs = [], currentUser) {
  if (!currentUser) return [];

  if (canSeeAllData(currentUser)) return labs;

  if (currentUser.role === ROLES.AGENT) {
    return labs.filter((lab) => {
      const assignedAgentId =
        lab.assignedAgentId ||
        lab.assigned_agent_id ||
        lab.agentId ||
        lab.agent_id ||
        "";
      const assignedAgent =
        lab.assignedAgent ||
        lab.agentName ||
        lab.agent_name ||
        lab.Agent_Name ||
        lab.owner ||
        "";
      const area = lab.area || lab.Area || "";

      if (agentRecordMatchesUser(assignedAgentId, assignedAgent, currentUser)) {
        return true;
      }

      return (
        normalize(area) &&
        normalize(currentUser.assignedArea) &&
        normalize(area) === normalize(currentUser.assignedArea)
      );
    });
  }

  if (currentUser.role === ROLES.LAB) {
    return labs.filter((lab) => {
      const labName = lab.labName || lab.name || lab.Lab_Name || "";
      return normalize(labName) === normalize(currentUser.name);
    });
  }

  return [];
}

function labScopeKey(lab = {}) {
  return `${normalize(lab.tenantId ?? lab.tenant_id)}|${labIdKey(lab.labId ?? lab.lab_id)}`;
}

export function ownedLabKeysFromOwnershipRows(ownershipRows = [], agentId = "") {
  const keys = new Set();
  const aid = normalizeAgentIdKey(agentId);
  if (!aid) return keys;
  for (const row of ownershipRows || []) {
    const primary = normalizeAgentIdKey(row.primaryAgentId ?? row.primary_agent_id);
    const secondary = normalizeAgentIdKey(row.secondaryAgentId ?? row.secondary_agent_id);
    if (primary !== aid && secondary !== aid) continue;
    const labTenantId = normalize(row.labTenantId ?? row.lab_tenant_id ?? row.tenantId);
    const lid = labIdKey(row.labId ?? row.lab_id);
    if (lid) keys.add(`${labTenantId}|${lid}`);
  }
  return keys;
}

/**
 * Agent lab scope: legacy primary assignment + ownership primary/secondary rows.
 */
export function filterLabsForUserWithOwnership(labs = [], currentUser, ownershipRows = []) {
  const base = filterLabsForUser(labs, currentUser);
  if (!currentUser || currentUser.role !== ROLES.AGENT || !ownershipRows?.length) return base;

  const ownedKeys = ownedLabKeysFromOwnershipRows(
    ownershipRows,
    currentUser.agentId || currentUser.agent_id
  );
  if (!ownedKeys.size) return base;

  const merged = new Map();
  for (const lab of base) merged.set(labScopeKey(lab), lab);
  for (const lab of labs) {
    const key = labScopeKey(lab);
    if (ownedKeys.has(key) && !merged.has(key)) merged.set(key, lab);
  }
  return [...merged.values()];
}

/**
 * Agent scope for AR rows: explicit ar_credit_control.agent_id, else labs.assigned_agent_id.
 */
export function collectionEffectiveAgentId(item) {
  return (
    item?.agentId ||
    item?.agent_id ||
    item?.assignedAgentId ||
    item?.assigned_agent_id ||
    ""
  );
}

export function filterCollectionsForUser(collections = [], currentUser, ownershipRows = []) {
  if (!currentUser) return [];

  if (canSeeAllData(currentUser)) return collections;

  if (currentUser.role === ROLES.AGENT) {
    const ownedKeys = ownedLabKeysFromOwnershipRows(
      ownershipRows,
      currentUser.agentId || currentUser.agent_id
    );
    return collections.filter((item) => {
      if (
        agentRecordMatchesUser(
          collectionEffectiveAgentId(item),
          item.assignedAgent || item.agentName || item.Agent_Name,
          currentUser
        )
      ) {
        return true;
      }
      if (!ownedKeys.size) return false;
      const key = `${normalize(item.tenantId ?? item.tenant_id)}|${labIdKey(item.labId ?? item.lab_id)}`;
      if (ownedKeys.has(key)) return true;
      const lid = labIdKey(item.labId ?? item.lab_id);
      if (!lid) return false;
      for (const owned of ownedKeys) {
        if (owned.endsWith(`|${lid}`)) return true;
      }
      return false;
    });
  }

  if (currentUser.role === ROLES.LAB) {
    const profileLabId = labIdKey(currentUser.labId || currentUser.lab_id);
    return collections.filter((item) => {
      const rowLabId = labIdKey(item.labId || item.lab_id);
      if (profileLabId && rowLabId) {
        return rowLabId === profileLabId;
      }
      const labName = item.labName || item.Lab_Name || "";
      return (
        normalize(labName) === normalize(currentUser.name) ||
        normalize(labName) === normalize(currentUser.labName)
      );
    });
  }

  return [];
}
