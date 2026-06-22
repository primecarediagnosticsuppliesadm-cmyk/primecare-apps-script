import { supabase } from "@/api/supabaseClient.js";
import { LOGIN_ENABLED_ROLES } from "@/config/roles.js";

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
  if (!LOGIN_ENABLED_ROLES.has(role) && role !== "distributor_admin") {
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

  const { error } = await supabase.from("user_provisioning_events").insert([
    {
      hq_tenant_id: str(tenantId),
      subject_user_id: str(subjectUserId),
      event_type: str(eventType),
      actor_user_id: actorUserId || null,
      payload,
    },
  ]);

  if (error) return { success: false, error: error.message || "Failed to write audit event" };
  return { success: true };
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
