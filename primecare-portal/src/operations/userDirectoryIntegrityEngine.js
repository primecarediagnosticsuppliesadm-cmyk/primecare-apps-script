import { isAgentRole, labsForAgent } from "@/operations/operationsCenterAdminEngine.js";
import {
  classifyDirectoryUser,
  isProbeOrDebugUser,
  USER_DIRECTORY_CLASS,
} from "@/operations/userDirectoryClassification.js";
import { OWNERSHIP_STATUS, ownershipRowKey } from "@/operations/labOwnershipEngine.js";
import { filterLabsForUserWithOwnership, ownedLabKeysFromOwnershipRows } from "@/utils/accessFilters.js";
import { ROLES } from "@/config/roles.js";
import { labIdKey, normalizeAgentIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

/** Canonical agent id for directory ↔ ownership reconciliation (profiles.agent_id). */
export function agentDirectoryAgentId(user = {}) {
  return str(user.agentId ?? user.agent_id);
}

function labScopeKey(lab = {}) {
  const tenant = str(lab.tenantId ?? lab.tenant_id ?? lab.hqTenantId).toLowerCase();
  return `${tenant}|${labIdKey(lab.labId ?? lab.lab_id)}`;
}

/**
 * Admin directory lab scope: profiles.agent_id only (no display-name fallback).
 * Merges labs.assigned_agent_id with ACTIVE ownership primary/secondary rows.
 */
export function labsForAgentDirectoryReconciled(agent, labs = [], ownershipRows = []) {
  if (!agent || !isAgentRole(agent.role)) return [];
  const aid = normalizeAgentIdKey(agentDirectoryAgentId(agent));
  if (!aid) return [];

  const merged = new Map();
  for (const lab of labs || []) {
    const assigned = normalizeAgentIdKey(lab.assignedAgentId ?? lab.assigned_agent_id);
    if (assigned !== aid) continue;
    merged.set(labScopeKey(lab), lab);
  }

  const ownedKeys = ownedLabKeysFromOwnershipRows(ownershipRows, aid);
  for (const lab of labs || []) {
    const key = labScopeKey(lab);
    if (ownedKeys.has(key) && !merged.has(key)) merged.set(key, lab);
  }

  return [...merged.values()];
}

/** Lab list aligned with Agent portal when agent_id is set (strict id reconciliation). */
export function labsForAgentPortalAligned(agent, labs = [], ownershipRows = []) {
  const aid = agentDirectoryAgentId(agent);
  if (aid) return labsForAgentDirectoryReconciled(agent, labs, ownershipRows);
  return filterLabsForUserWithOwnership(labs, agentPortalUser(agent), ownershipRows);
}

function agentPortalUser(user = {}) {
  const agentId = str(user.agentId ?? user.agent_id) || str(user.userId);
  return {
    role: ROLES.AGENT,
    agentId,
    agent_id: agentId,
    name: user.name ?? user.displayName,
    agentName: user.agentName ?? user.name ?? user.displayName,
  };
}

/** Lab count aligned with Agent portal workspace. */
export function countAgentLabsPortalAligned(user, labAssignments = [], ownershipRows = []) {
  return labsForAgentPortalAligned(user, labAssignments, ownershipRows).length;
}

export function countOwnershipLabsForAgent(user, ownershipRows = [], options = {}) {
  const includeSecondary = options.includeSecondary === true;
  const aid = normalizeAgentIdKey(agentDirectoryAgentId(user));
  if (!aid) return 0;

  const labKeysInScope = new Set();
  for (const lab of options.labAssignments || []) {
    const labId = labIdKey(lab.labId ?? lab.lab_id);
    if (!labId) continue;
    const tenantKey = str(lab.tenantId ?? lab.tenant_id ?? lab.hqTenantId).toLowerCase();
    labKeysInScope.add(`${tenantKey}|${labId}`);
  }
  const scopeLabs = labKeysInScope.size > 0;

  const seen = new Set();
  let count = 0;
  for (const row of ownershipRows || []) {
    const status = str(row.status ?? row.Status).toUpperCase();
    if (status && status !== OWNERSHIP_STATUS.ACTIVE) continue;
    const primary = normalizeAgentIdKey(row.primary_agent_id ?? row.primaryAgentId);
    const secondary = normalizeAgentIdKey(row.secondary_agent_id ?? row.secondaryAgentId);
    const labId = labIdKey(row.lab_id ?? row.labId);
    const tenantKey = str(
      row.lab_tenant_id ?? row.labTenantId ?? row.tenant_id ?? row.tenantId
    ).toLowerCase();
    const dedupe = `${tenantKey}|${labId}`;
    if (!labId || (scopeLabs && !labKeysInScope.has(dedupe))) continue;
    const match = primary === aid || (includeSecondary && secondary === aid);
    if (!match) continue;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    count += 1;
  }
  return count;
}

/**
 * Read-only diagnostics for Operations Center user directory + ownership alignment.
 */
export function computeUserDirectoryIntegrityWarnings({
  directoryUsers = [],
  labAssignments = [],
  ownershipRows = [],
} = {}) {
  const warnings = [];
  const probeWithLabs = [];
  const duplicateActiveOwnership = [];
  const assignedVsOwnershipMismatch = [];
  const agentLabCountMismatch = [];

  for (const user of directoryUsers) {
    if (!user) continue;
    const cls = classifyDirectoryUser(user);
    const labs = Number(user.assignedLabsCount) || 0;
    if (labs > 0 && cls === USER_DIRECTORY_CLASS.PROBE_DEBUG) {
      probeWithLabs.push({
        userId: user.userId,
        email: user.email,
        name: user.displayName || user.name,
        assignedLabsCount: labs,
      });
    }

    if (isAgentRole(user.role)) {
      const fromAssignments = labsForAgent(user, labAssignments).length;
      const fromOwnership = countOwnershipLabsForAgent(user, ownershipRows, { labAssignments });
      const fromPortal = countAgentLabsPortalAligned(user, labAssignments, ownershipRows);
      const reported = Number(user.assignedLabsCount) || 0;
      if (fromPortal !== reported || fromAssignments !== fromPortal || fromOwnership !== fromPortal) {
        agentLabCountMismatch.push({
          userId: user.userId,
          agentId: user.agentId,
          name: user.displayName || user.name,
          fromAssignments,
          fromOwnership,
          fromPortal,
          reported,
          userClass: cls,
        });
      }
    }
  }

  const activeByLab = new Map();
  for (const row of ownershipRows || []) {
    const status = str(row.status ?? row.Status).toUpperCase();
    if (status && status !== OWNERSHIP_STATUS.ACTIVE) continue;
    const tenantId = str(row.tenant_id ?? row.tenantId);
    const labId = str(row.lab_id ?? row.labId).toUpperCase();
    if (!labId) continue;
    const key = ownershipRowKey(tenantId, labId);
    const primary = str(row.primary_agent_id ?? row.primaryAgentId);
    const bucket = activeByLab.get(key) || [];
    bucket.push({ primaryAgentId: primary, id: str(row.id) });
    activeByLab.set(key, bucket);
  }

  for (const [key, rows] of activeByLab.entries()) {
    if (rows.length <= 1) continue;
    const primaries = new Set(rows.map((r) => str(r.primaryAgentId).toLowerCase()).filter(Boolean));
    if (primaries.size > 1 || rows.length > 1) {
      duplicateActiveOwnership.push({ key, rows });
    }
  }

  for (const lab of labAssignments || []) {
    const labId = str(lab.labId).toUpperCase();
    const assigned = str(lab.assignedAgentId ?? lab.assigned_agent_id);
    const primary = str(lab.primaryAgentId ?? lab.ownership?.primaryAgentId);
    if (assigned && primary && assigned.toLowerCase() !== primary.toLowerCase()) {
      assignedVsOwnershipMismatch.push({
        labId,
        assignedAgentId: assigned,
        ownershipPrimaryAgentId: primary,
      });
    }
  }

  if (probeWithLabs.length) {
    warnings.push({
      id: "probe_ownership",
      severity: "critical",
      title: "Probe/debug users with lab assignments",
      detail: `${probeWithLabs.length} probe/debug user(s) appear to own labs`,
      items: probeWithLabs,
    });
  }

  if (duplicateActiveOwnership.length) {
    warnings.push({
      id: "duplicate_active_ownership",
      severity: "attention",
      title: "Duplicate active ownership rows",
      detail: `${duplicateActiveOwnership.length} lab(s) have multiple ACTIVE ownership records`,
      items: duplicateActiveOwnership.slice(0, 10),
    });
  }

  if (assignedVsOwnershipMismatch.length) {
    warnings.push({
      id: "assigned_vs_ownership",
      severity: "attention",
      title: "Lab assignment vs ownership mismatch",
      detail: `${assignedVsOwnershipMismatch.length} lab(s) differ between assigned_agent_id and ownership`,
      items: assignedVsOwnershipMismatch.slice(0, 10),
    });
  }

  if (agentLabCountMismatch.length) {
    warnings.push({
      id: "agent_lab_count_mismatch",
      severity: "monitor",
      title: "Agent lab count mismatch",
      detail: `${agentLabCountMismatch.length} agent(s) show different lab counts across sources`,
      items: agentLabCountMismatch.slice(0, 10),
    });
  }

  return {
    warnings,
    probeWithLabs,
    duplicateActiveOwnership,
    assignedVsOwnershipMismatch,
    agentLabCountMismatch,
    summary: {
      warningCount: warnings.length,
      probeWithLabs: probeWithLabs.length,
      duplicateActiveOwnership: duplicateActiveOwnership.length,
      assignedVsOwnershipMismatch: assignedVsOwnershipMismatch.length,
      agentLabCountMismatch: agentLabCountMismatch.length,
    },
  };
}

export { isProbeOrDebugUser };
