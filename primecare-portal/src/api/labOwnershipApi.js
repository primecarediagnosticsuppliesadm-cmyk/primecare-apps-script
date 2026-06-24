import { supabase } from "@/api/supabaseClient.js";
import { buildProvisioningAuditPayload } from "@/operations/userProvisioningEngine.js";
import { insertProvisioningEventWrite } from "@/api/userProvisioningApi.js";
import { updateLabAgentAssignmentWrite } from "@/api/primecareSupabaseApi.js";
import { mapLabOwnershipRow } from "@/operations/labOwnershipEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function isMissingTableError(message = "") {
  return /lab_ownership|relation.*does not exist|schema cache/i.test(message);
}

export async function getLabOwnershipRead(options = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: { rows: [] } };
  }

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!tenantId) return { success: false, error: "Tenant is required", data: { rows: [] } };

  const status = str(options.status).toUpperCase() || "ACTIVE";
  let query = supabase
    .from("lab_ownership")
    .select(
      "id, tenant_id, lab_tenant_id, lab_id, primary_agent_id, secondary_agent_id, manager_id, assigned_at, assigned_by, status, created_at, updated_at"
    )
    .eq("tenant_id", tenantId);

  if (status) query = query.eq("status", status);
  query = query.order("assigned_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    return {
      success: !isMissingTableError(error.message || ""),
      error: isMissingTableError(error.message || "")
        ? "Run user_provisioning_phase3c_lab_ownership_migration.sql"
        : error.message,
      data: { rows: [] },
    };
  }

  return {
    success: true,
    data: { rows: (data || []).map(mapLabOwnershipRow) },
  };
}

export async function getLabOwnership(options = {}) {
  const tenantId = str(options.tenantId ?? options.tenant_id);
  const labId = str(options.labId ?? options.lab_id);
  const res = await getLabOwnershipRead({ tenantId, status: "ACTIVE" });
  if (!res.success) return res;
  const row = (res.data.rows || []).find((r) => str(r.labId).toLowerCase() === labId.toLowerCase());
  return { success: true, data: { ownership: row || null } };
}

export async function getAgentOwnedLabsRead(options = {}) {
  const tenantId = str(options.tenantId ?? options.tenant_id);
  const agentId = str(options.agentId ?? options.agent_id);
  const res = await getLabOwnershipRead({ tenantId, status: "ACTIVE" });
  if (!res.success) return { ...res, data: { labs: [] } };
  const labs = (res.data.rows || []).filter(
    (r) =>
      str(r.primaryAgentId).toLowerCase() === agentId.toLowerCase() ||
      str(r.secondaryAgentId).toLowerCase() === agentId.toLowerCase()
  );
  return { success: true, data: { labs } };
}

export async function getManagerOwnedLabsRead(options = {}) {
  const tenantId = str(options.tenantId ?? options.tenant_id);
  const managerId = str(options.managerId ?? options.manager_id);
  const res = await getLabOwnershipRead({ tenantId, status: "ACTIVE" });
  if (!res.success) return { ...res, data: { labs: [] } };
  const labs = (res.data.rows || []).filter(
    (r) => str(r.managerId).toLowerCase() === managerId.toLowerCase()
  );
  return { success: true, data: { labs } };
}

export async function getUnassignedLabsRead(options = {}) {
  const tenantId = str(options.tenantId ?? options.tenant_id);
  const labAssignments = options.labAssignments || [];
  const ownershipRes = await getLabOwnershipRead({ tenantId, status: "ACTIVE" });
  const ownedKeys = new Set(
    (ownershipRes.data?.rows || []).map((r) => `${str(r.labTenantId)}::${str(r.labId)}`.toLowerCase())
  );

  const unassigned = (labAssignments || []).filter((lab) => {
    const key = `${str(lab.tenantId)}::${str(lab.labId)}`.toLowerCase();
    const hasLegacy = Boolean(str(lab.assignedAgentId));
    const hasDurable = [...ownedKeys].some((k) => k.endsWith(`::${str(lab.labId).toLowerCase()}`));
    return !hasLegacy && !hasDurable;
  });

  return {
    success: ownershipRes.success,
    error: ownershipRes.error,
    data: { labs: unassigned },
  };
}

/**
 * Single source of truth for HQ primary lab assignment.
 * Writes lab_ownership (RPC) and syncs labs.assigned_agent_id.
 */
export async function assignPrimaryLabOwnerWrite(payload = {}) {
  const hqTenantId = str(payload.hqTenantId ?? payload.tenantId ?? payload.tenant_id);
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id ?? payload.tenantId);
  const labId = str(payload.labId ?? payload.lab_id);
  const primaryAgentId = str(
    payload.primaryAgentId ?? payload.primary_agent_id ?? payload.agentId ?? payload.agent_id
  );
  const agentName = str(payload.agentName ?? payload.agent_name ?? payload.primaryAgentName);

  return assignLabOwnership({
    tenantId: hqTenantId,
    labTenantId,
    labId,
    primaryAgentId,
    secondaryAgentId: payload.secondaryAgentId ?? payload.secondary_agent_id,
    managerId: payload.managerId ?? payload.manager_id,
    subjectUserId: payload.subjectUserId ?? payload.subject_user_id,
    agentName,
    labName: payload.labName ?? payload.lab_name,
    reason: payload.reason,
  });
}

/**
 * Remove primary ownership and clear legacy lab assignment.
 */
export async function unassignPrimaryLabOwnerWrite(payload = {}) {
  const hqTenantId = str(payload.hqTenantId ?? payload.tenantId ?? payload.tenant_id);
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id);
  const labId = str(payload.labId ?? payload.lab_id);

  return removeLabOwnership({
    tenantId: hqTenantId,
    labTenantId,
    labId,
    subjectUserId: payload.subjectUserId ?? payload.subject_user_id,
    reason: payload.reason || "ownership_removed",
  });
}

async function writeOwnershipAuditEvent({
  tenantId,
  subjectUserId,
  eventType,
  payload,
}) {
  return insertProvisioningEventWrite({
    tenantId,
    subjectUserId: subjectUserId || undefined,
    eventType,
    payload: buildProvisioningAuditPayload({
      action: eventType,
      related: payload,
    }),
  });
}

async function syncPrimaryLabAssignment({ labTenantId, labId, primaryAgentId, agentName }) {
  if (!labTenantId || !labId || !primaryAgentId) return { success: true };
  return updateLabAgentAssignmentWrite({
    tenantId: labTenantId,
    labId,
    agentId: primaryAgentId,
    agentName: agentName || primaryAgentId,
  });
}

export async function assignLabOwnership(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id ?? payload.tenantId);
  const labId = str(payload.labId ?? payload.lab_id);
  const primaryAgentId = str(payload.primaryAgentId ?? payload.primary_agent_id);
  const secondaryAgentId = str(payload.secondaryAgentId ?? payload.secondary_agent_id);
  const managerId = str(payload.managerId ?? payload.manager_id) || null;
  const subjectUserId = str(payload.subjectUserId ?? payload.subject_user_id);
  const agentName = str(payload.agentName ?? payload.primaryAgentName);
  const labName = str(payload.labName);
  const reason = str(payload.reason);

  if (!tenantId || !labTenantId || !labId || !primaryAgentId) {
    return { success: false, error: "tenantId, labTenantId, labId, and primaryAgentId are required" };
  }

  const { data, error } = await supabase.rpc("assign_lab_ownership", {
    p_tenant_id: tenantId,
    p_lab_tenant_id: labTenantId,
    p_lab_id: labId,
    p_primary_agent_id: primaryAgentId,
    p_secondary_agent_id: secondaryAgentId || null,
    p_manager_id: managerId,
    p_assigned_by: null,
  });

  if (error) {
    return {
      success: false,
      error: isMissingTableError(error.message || "")
        ? "Run user_provisioning_phase3c_lab_ownership_migration.sql"
        : error.message || "Failed to assign ownership",
    };
  }

  await syncPrimaryLabAssignment({ labTenantId, labId, primaryAgentId, agentName });

  if (subjectUserId) {
    await writeOwnershipAuditEvent({
      tenantId,
      subjectUserId,
      eventType: "ownership_assigned",
      payload: {
        labId,
        labName,
        labTenantId,
        primaryAgentId,
        secondaryAgentId: secondaryAgentId || undefined,
        managerId: managerId || undefined,
        reason: reason || undefined,
        slot: "primary",
      },
    });
    if (secondaryAgentId) {
      await writeOwnershipAuditEvent({
        tenantId,
        subjectUserId,
        eventType: "ownership_secondary_added",
        payload: { labId, labName, labTenantId, secondaryAgentId, reason },
      });
    }
  }

  return { success: true, data: mapLabOwnershipRow(data || {}) };
}

export async function updateLabOwnership(payload = {}) {
  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id);
  const labId = str(payload.labId ?? payload.lab_id);
  const previous = payload.previous || {};

  return assignLabOwnership({
    ...payload,
    tenantId,
    labTenantId,
    labId,
    reason: payload.reason || "ownership_update",
    previousPrimaryAgentId: previous.primaryAgentId,
  });
}

export async function transferLabOwnership(payload = {}) {
  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id);
  const labId = str(payload.labId ?? payload.lab_id);
  const fromAgentId = str(payload.fromAgentId ?? payload.from_agent_id);
  const toAgentId = str(payload.toAgentId ?? payload.to_agent_id ?? payload.primaryAgentId);
  const subjectUserId = str(payload.subjectUserId ?? payload.subject_user_id);
  const labName = str(payload.labName);
  const reason = str(payload.reason);

  const res = await assignLabOwnership({
    ...payload,
    tenantId,
    labTenantId,
    labId,
    primaryAgentId: toAgentId,
    subjectUserId,
    reason,
  });

  if (res.success && subjectUserId) {
    await writeOwnershipAuditEvent({
      tenantId,
      subjectUserId,
      eventType: "ownership_transferred",
      payload: {
        labId,
        labName,
        labTenantId,
        fromAgentId,
        toAgentId,
        reason,
      },
    });
  }

  return res;
}

export async function removeLabOwnership(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id);
  const labId = str(payload.labId ?? payload.lab_id);
  const subjectUserId = str(payload.subjectUserId ?? payload.subject_user_id);
  const reason = str(payload.reason);

  const { data, error } = await supabase.rpc("deactivate_lab_ownership", {
    p_tenant_id: tenantId,
    p_lab_id: labId,
  });

  if (error) {
    return {
      success: false,
      error: error.message || "Failed to remove ownership",
    };
  }

  if (labTenantId) {
    await updateLabAgentAssignmentWrite({ tenantId: labTenantId, labId, remove: true });
  }

  if (subjectUserId) {
    await writeOwnershipAuditEvent({
      tenantId,
      subjectUserId,
      eventType: "ownership_removed",
      payload: { labId, labTenantId, reason },
    });
  }

  return { success: true, data };
}
