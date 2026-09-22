import { ROLES } from "@/config/roles.js";
import { normalizeAgentIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

function actorRole(actor = {}) {
  return str(actor.role || actor.platformRole).toLowerCase();
}

function actorTenantId(actor = {}) {
  return str(actor.tenantId || actor.tenant_id);
}

function actorAgentId(actor = {}) {
  return normalizeAgentIdKey(actor.agentId || actor.agent_id);
}

/**
 * Resolve which Agent's book of business to load.
 * Agent: always current profile agent_id — client subjectAgentId is discarded.
 * Admin/Executive: selected Agent must be same tenant and role=agent.
 * HR / Lab / Auditor / others: forbidden.
 *
 * @param {{ actor: object, requestedSubjectAgentId?: string, agentDirectory?: object[] }} input
 */
export function resolveMyBusinessSubjectAgent(input = {}) {
  const actor = input.actor || {};
  const role = actorRole(actor);
  const requested = normalizeAgentIdKey(input.requestedSubjectAgentId);
  const directory = Array.isArray(input.agentDirectory) ? input.agentDirectory : [];

  if (role === ROLES.AGENT) {
    const subjectAgentId = actorAgentId(actor);
    if (!subjectAgentId) {
      return {
        ok: false,
        error: "agent_identity_missing",
        subjectAgentId: "",
        ignoredClientSubjectAgentId: Boolean(requested),
      };
    }
    return {
      ok: true,
      error: null,
      subjectAgentId,
      ignoredClientSubjectAgentId: Boolean(requested && requested !== subjectAgentId),
    };
  }

  if (role !== ROLES.ADMIN && role !== ROLES.EXECUTIVE) {
    return {
      ok: false,
      error: "forbidden",
      subjectAgentId: "",
      ignoredClientSubjectAgentId: false,
    };
  }

  if (!requested) {
    return {
      ok: false,
      error: "agent_required",
      subjectAgentId: "",
      ignoredClientSubjectAgentId: false,
    };
  }

  const actorTenant = actorTenantId(actor);
  const match = directory.find((row) => {
    const id = normalizeAgentIdKey(row.agentId || row.agent_id);
    return id && id === requested;
  });
  if (!match) {
    return {
      ok: false,
      error: "agent_not_found",
      subjectAgentId: "",
      ignoredClientSubjectAgentId: false,
    };
  }

  const matchRole = str(match.role).toLowerCase();
  if (matchRole && matchRole !== ROLES.AGENT) {
    return {
      ok: false,
      error: "not_an_agent",
      subjectAgentId: "",
      ignoredClientSubjectAgentId: false,
    };
  }

  const matchTenant = str(match.tenantId || match.tenant_id);
  if (actorTenant && matchTenant && actorTenant !== matchTenant) {
    return {
      ok: false,
      error: "cross_tenant",
      subjectAgentId: "",
      ignoredClientSubjectAgentId: false,
    };
  }

  return {
    ok: true,
    error: null,
    subjectAgentId: requested,
    ignoredClientSubjectAgentId: false,
  };
}

export function canAccessMyBusiness(actor = {}) {
  const role = actorRole(actor);
  return role === ROLES.AGENT || role === ROLES.ADMIN || role === ROLES.EXECUTIVE;
}
