import { ROLES } from "@/config/roles";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function canSeeAllData(currentUser) {
  return (
    currentUser?.role === ROLES.ADMIN ||
    currentUser?.role === ROLES.EXECUTIVE
  );
}

export function filterVisitsForUser(visits = [], currentUser) {
  if (!currentUser) return [];

  if (canSeeAllData(currentUser)) return visits;

  if (currentUser.role === ROLES.AGENT) {
    return visits.filter((visit) => {
      const visitAgent =
        visit.agent ||
        visit.agentName ||
        visit.Agent_Name ||
        "";
      return normalize(visitAgent) === normalize(currentUser.name);
    });
  }

  return [];
}

export function filterLabsForUser(labs = [], currentUser) {
  if (!currentUser) return [];

  if (canSeeAllData(currentUser)) return labs;

  if (currentUser.role === ROLES.AGENT) {
    return labs.filter((lab) => {
      const assignedAgent =
        lab.assignedAgent ||
        lab.agentName ||
        lab.Agent_Name ||
        lab.owner ||
        "";
      const area =
        lab.area ||
        lab.Area ||
        "";

      return (
        normalize(assignedAgent) === normalize(currentUser.name) ||
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
    return collections.filter((item) => {
      const assignedAgent =
        item.assignedAgent ||
        item.agentName ||
        item.Agent_Name ||
        "";
      return normalize(assignedAgent) === normalize(currentUser.name);
    });
  }

  if (currentUser.role === ROLES.LAB) {
    return collections.filter((item) => {
      const labName = item.labName || item.Lab_Name || "";
      return normalize(labName) === normalize(currentUser.name);
    });
  }

  return [];
}