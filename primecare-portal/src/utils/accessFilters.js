import { ROLES } from "@/config/roles";
import { normalizeAgentIdKey } from "@/utils/labId";

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

/**
 * Temporary QA diagnostics for agent lab assignment (B2).
 */
export function logAgentLabFilterDebug(currentUser, allLabs = [], filteredLabs = []) {
  console.log("AGENT PROFILE", {
    id: currentUser?.id,
    role: currentUser?.role,
    agentId: currentUser?.agentId || currentUser?.agent_id,
    agentName: currentUser?.agentName || currentUser?.name,
    tenantId: currentUser?.tenantId || currentUser?.tenant_id,
  });

  console.log("LAB FILTER RESULT", {
    totalFromApi: allLabs.length,
    visibleCount: filteredLabs.length,
    visibleLabIds: filteredLabs.map((l) => l.labId || l.lab_id).filter(Boolean),
  });

  console.log("VISIBLE LABS", filteredLabs);

  (allLabs || []).forEach((lab) => {
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
    const matchesById = agentRecordMatchesUser(assignedAgentId, "", currentUser);
    const matchesByName = agentRecordMatchesUser("", assignedAgent, currentUser);
    const included = filteredLabs.some(
      (row) =>
        normalizeAgentIdKey(row.labId || row.lab_id) ===
        normalizeAgentIdKey(lab.labId || lab.lab_id)
    );

    console.log("LAB ASSIGNMENT CHECK", {
      labId: lab.labId || lab.lab_id,
      assignedAgentId,
      assignedAgent,
      profileAgentId: profileAgentId(currentUser),
      matchesById,
      matchesByName,
      included,
    });
  });
}

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

export function filterCollectionsForUser(collections = [], currentUser) {
  if (!currentUser) return [];

  if (canSeeAllData(currentUser)) return collections;

  if (currentUser.role === ROLES.AGENT) {
    return collections.filter((item) =>
      agentRecordMatchesUser(
        item.agentId || item.assignedAgentId,
        item.assignedAgent || item.agentName || item.Agent_Name,
        currentUser
      )
    );
  }

  if (currentUser.role === ROLES.LAB) {
    return collections.filter((item) => {
      const labName = item.labName || item.Lab_Name || "";
      return normalize(labName) === normalize(currentUser.name);
    });
  }

  return [];
}
