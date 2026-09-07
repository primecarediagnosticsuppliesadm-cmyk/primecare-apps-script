/**
 * Visit-only account eligibility. Do not use for Orders / AR / Collections.
 * The operational lab filter used by Orders/AR is unchanged and is not imported here.
 */
import { labIdKey, normalizeAgentIdKey } from "../utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

export function labLifecycleStatus(lab = {}) {
  return str(lab.status ?? lab.Status ?? lab.lifecycleStatus).toUpperCase();
}

export function isProspectLab(lab = {}) {
  return labLifecycleStatus(lab) === "PROSPECT";
}

export function sourcedByAgentId(lab = {}) {
  return normalizeAgentIdKey(
    lab.sourcedByAgentId ?? lab.sourced_by_agent_id ?? lab.sourcedBy ?? ""
  );
}

export function assignedAgentId(lab = {}) {
  return normalizeAgentIdKey(
    lab.assignedAgentId ??
      lab.assigned_agent_id ??
      lab.agentId ??
      lab.agent_id ??
      ""
  );
}

export function isAgentSourcedProspect(lab, currentUser) {
  if (!isProspectLab(lab) || !currentUser) return false;
  const profileId = normalizeAgentIdKey(currentUser.agentId || currentUser.agent_id);
  const sourced = sourcedByAgentId(lab);
  return Boolean(profileId && sourced && profileId === sourced);
}

export function isAssignedOperationalLab(lab, currentUser) {
  if (isProspectLab(lab) || !currentUser) return false;
  const profileId = normalizeAgentIdKey(currentUser.agentId || currentUser.agent_id);
  const assigned = assignedAgentId(lab);
  return Boolean(profileId && assigned && profileId === assigned);
}

/**
 * Assigned operational labs for Visit picker (excludes PROSPECT).
 * Does not reuse the operational Orders/AR lab filter.
 */
export function filterOperationalLabsForVisit(labs = [], currentUser) {
  return (labs || []).filter((lab) => isAssignedOperationalLab(lab, currentUser));
}

export function filterSourcedProspectsForVisit(labs = [], currentUser) {
  if (!currentUser || str(currentUser.role).toLowerCase() !== "agent") return [];
  return (labs || []).filter((lab) => isAgentSourcedProspect(lab, currentUser));
}

export function partitionVisitEligibleAccounts(labs = [], currentUser) {
  const operational = filterOperationalLabsForVisit(labs, currentUser);
  const prospects = filterSourcedProspectsForVisit(labs, currentUser);
  const seen = new Set();
  const all = [];
  for (const lab of [...operational, ...prospects]) {
    const key = labIdKey(lab.labId || lab.lab_id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(lab);
  }
  return { operational, prospects, all };
}

export function accountHasOperationalCtas(lab) {
  return !isProspectLab(lab);
}
