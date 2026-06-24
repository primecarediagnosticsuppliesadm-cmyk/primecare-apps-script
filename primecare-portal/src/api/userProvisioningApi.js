import { supabase } from "@/api/supabaseClient.js";
import { isProvisionableRole } from "@/config/rolePermissionMatrix.js";
import { buildProvisioningAuditPayload } from "@/operations/userProvisioningEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function functionsBaseUrl() {
  const url = str(import.meta.env.VITE_SUPABASE_URL);
  if (!url) return "";
  return `${url.replace(/\/$/, "")}/functions/v1`;
}

async function invokeProvisioningFunction(functionName, payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const base = functionsBaseUrl();
  if (!base) return { success: false, error: "Supabase URL is not configured" };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { success: false, error: "Not authenticated" };

  try {
    const res = await fetch(`${base}/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: str(import.meta.env.VITE_SUPABASE_ANON_KEY),
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.success) {
      return {
        success: false,
        error: body?.error || `${functionName} failed (${res.status})`,
      };
    }
    return { success: true, data: body.data };
  } catch (err) {
    return { success: false, error: err?.message || `${functionName} request failed` };
  }
}

/**
 * Provision a platform user via Edge Function (auth + profile + directory + audit).
 * Service role never touches the browser.
 */
export async function provisionPlatformUserWrite(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const role = str(payload.role).toLowerCase();
  if (!isProvisionableRole(role)) {
    return { success: false, error: "Invalid role for provisioning" };
  }

  return invokeProvisioningFunction("provision-platform-user", {
    tenantId: payload.tenantId ?? payload.tenant_id,
    displayName: payload.displayName ?? payload.name,
    email: payload.email,
    username: payload.username,
    phone: payload.phone,
    role: payload.role,
    active: payload.active,
    agentId: payload.agentId ?? payload.agent_id,
    labId: payload.labId ?? payload.lab_id,
    distributorId: payload.distributorId ?? payload.distributor_id,
    territory: payload.territory,
  });
}

export async function resetPlatformUserPasswordWrite(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const subjectUserId = str(payload.subjectUserId ?? payload.userId ?? payload.user_id);
  const email = str(payload.email);
  if (!subjectUserId && !email) {
    return { success: false, error: "User id or email is required" };
  }

  return invokeProvisioningFunction("reset-platform-user-password", {
    tenantId: payload.tenantId ?? payload.tenant_id,
    subjectUserId,
    email: email || undefined,
  }).then((result) => {
    if (!result?.success) return result;

    const raw = result.data || {};
    const data = {
      userId: str(raw.userId ?? raw.user_id),
      email: str(raw.email),
      displayName: str(raw.displayName ?? raw.display_name),
      temporaryPassword: str(
        raw.temporaryPassword ?? raw.temporary_password ?? raw.password
      ),
    };

    if (!data.temporaryPassword) {
      return {
        success: false,
        error: "Password reset succeeded but no temporary password was returned",
      };
    }

    return { success: true, data };
  });
}

export async function deactivatePlatformUserWrite(userId, reason) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };
  const uid = str(userId);
  const r = str(reason);
  if (!uid) return { success: false, error: "User id is required" };
  if (!r) return { success: false, error: "Deactivation reason is required" };

  const { data, error } = await supabase.rpc("deactivate_platform_user", {
    p_subject_user_id: uid,
    p_reason: r,
  });

  if (error) return { success: false, error: error.message || "Failed to deactivate user" };
  return { success: true, data };
}

export async function reactivatePlatformUserWrite(userId, note = "") {
  if (!supabase) return { success: false, error: "Supabase is not configured" };
  const uid = str(userId);
  if (!uid) return { success: false, error: "User id is required" };

  const { data, error } = await supabase.rpc("reactivate_platform_user", {
    p_subject_user_id: uid,
    p_note: str(note) || null,
  });

  if (error) return { success: false, error: error.message || "Failed to reactivate user" };
  return { success: true, data };
}

/** Record authenticated sign-in on profiles.last_login_at (Phase 3B RPC). */
export async function touchPlatformUserLastLoginWrite() {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const { data, error } = await supabase.rpc("touch_platform_user_last_login");

  if (error) {
    const missing = /touch_platform_user_last_login|function.*does not exist|last_login_at/i.test(
      error.message || ""
    );
    return {
      success: false,
      error: missing
        ? "Run user_provisioning_phase3b_migration.sql in Supabase"
        : error.message || "Failed to update last login",
    };
  }

  return { success: true, data: { lastLoginAt: data } };
}

export async function getUserProvisioningEventsRead(options = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: { events: [] } };
  }

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!tenantId) return { success: false, error: "Tenant is required", data: { events: [] } };

  const { data, error } = await supabase
    .from("user_provisioning_events")
    .select("id, hq_tenant_id, subject_user_id, event_type, actor_user_id, payload, created_at")
    .eq("hq_tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);

  if (error) {
    const missing = /user_provisioning_events|relation.*does not exist/i.test(error.message || "");
    return {
      success: !missing,
      error: missing
        ? "Run user_provisioning_v1_migration.sql in Supabase"
        : error.message || "Failed to load audit events",
      data: { events: [] },
    };
  }

  return { success: true, data: { events: data || [] } };
}

export async function insertProvisioningEventWrite({
  tenantId,
  subjectUserId,
  eventType,
  payload = {},
}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const { data: sessionData } = await supabase.auth.getSession();
  const actorUserId = sessionData?.session?.user?.id;

  const normalizedPayload =
    payload?.schemaVersion === 1
      ? payload
      : buildProvisioningAuditPayload({
          action: str(eventType),
          related: payload,
        });

  const { error } = await supabase.from("user_provisioning_events").insert([
    {
      hq_tenant_id: str(tenantId),
      subject_user_id: str(subjectUserId),
      event_type: str(eventType),
      actor_user_id: actorUserId || null,
      payload: normalizedPayload,
    },
  ]);

  if (error) return { success: false, error: error.message || "Failed to write audit event" };
  return { success: true };
}

export async function writeRoleChangedEvent({
  tenantId,
  subjectUserId,
  previousRole,
  nextRole,
  reason = "",
  related = {},
}) {
  return insertProvisioningEventWrite({
    tenantId,
    subjectUserId,
    eventType: "role_changed",
    payload: buildProvisioningAuditPayload({
      action: "role_changed",
      reason,
      previous: { role: str(previousRole) },
      next: { role: str(nextRole) },
      related,
    }),
  });
}

export async function writeOwnershipReassignedEvent({
  tenantId,
  subjectUserId,
  labId,
  labName = "",
  labTenantId = "",
  fromAgentId = "",
  fromAgentName = "",
  toAgentId = "",
  toAgentName = "",
  reason = "",
  slot = "primary",
  related = {},
}) {
  return insertProvisioningEventWrite({
    tenantId,
    subjectUserId,
    eventType: "ownership_reassigned",
    payload: buildProvisioningAuditPayload({
      action: "ownership_reassigned",
      reason,
      previous: {
        agentId: str(fromAgentId) || undefined,
        agentName: str(fromAgentName) || undefined,
      },
      next: {
        agentId: str(toAgentId) || undefined,
        agentName: str(toAgentName) || undefined,
        slot: str(slot) || "primary",
      },
      related: {
        labId: str(labId),
        labName: str(labName) || undefined,
        labTenantId: str(labTenantId) || undefined,
        fromAgentId: str(fromAgentId) || undefined,
        fromAgentName: str(fromAgentName) || undefined,
        toAgentId: str(toAgentId) || undefined,
        toAgentName: str(toAgentName) || undefined,
        slot: str(slot) || "primary",
        ...related,
      },
    }),
  });
}

export async function writeAccessAuditUpdatedEvent({
  tenantId,
  subjectUserId,
  action,
  reason,
  previous = {},
  next = {},
  related = {},
}) {
  return insertProvisioningEventWrite({
    tenantId,
    subjectUserId,
    eventType: "updated",
    payload: buildProvisioningAuditPayload({
      action: str(action),
      reason: str(reason),
      previous,
      next,
      related,
    }),
  });
}

export async function insertLabAssignmentHistoryWrite(row = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const { data: sessionData } = await supabase.auth.getSession();
  const actorUserId = sessionData?.session?.user?.id;

  const { error } = await supabase.from("lab_assignment_history").insert([
    {
      hq_tenant_id: str(row.hqTenantId ?? row.tenantId),
      lab_tenant_id: str(row.labTenantId),
      lab_id: str(row.labId),
      from_agent_id: str(row.fromAgentId) || null,
      from_agent_name: str(row.fromAgentName) || null,
      to_agent_id: str(row.toAgentId) || null,
      to_agent_name: str(row.toAgentName) || null,
      transferred_by: actorUserId || null,
      reason: str(row.reason) || null,
    },
  ]);

  if (error) return { success: false, error: error.message || "Failed to write lab history" };
  return { success: true };
}
