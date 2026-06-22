// PrimeCare HQ: provision platform user (auth + profile + directory + audit).
// Deploy with Supabase CLI. Requires SUPABASE_SERVICE_ROLE_KEY in function secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVISION_ROLES = new Set(["admin", "executive", "agent", "lab", "distributor_admin"]);
const LOGIN_BLOCKED_ROLES = new Set(["distributor_admin"]);

type ProvisionBody = {
  tenantId?: string;
  displayName?: string;
  name?: string;
  email?: string;
  username?: string;
  phone?: string;
  role?: string;
  active?: boolean;
  agentId?: string;
  labId?: string;
  distributorId?: string;
  territory?: string;
  password?: string;
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function directoryRole(role: string): string {
  const r = role.toLowerCase();
  if (r === "lab") return "LAB";
  if (r === "agent") return "AGENT";
  if (r === "admin") return "ADMIN";
  if (r === "executive") return "EXECUTIVE";
  if (r === "distributor_admin") return "DISTRIBUTOR_ADMIN";
  return r.toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ success: false, error: "Server configuration missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: "Missing authorization" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return jsonResponse({ success: false, error: "Invalid session" }, 401);
  }

  const actorUserId = authData.user.id;

  const { data: actorProfile, error: profileErr } = await userClient
    .from("profiles")
    .select("tenant_id, role, active")
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (profileErr || !actorProfile) {
    return jsonResponse({ success: false, error: "Caller profile not found" }, 403);
  }
  if (actorProfile.active !== true) {
    return jsonResponse({ success: false, error: "Caller profile inactive" }, 403);
  }

  const callerRole = str(actorProfile.role).toLowerCase();
  if (callerRole !== "admin" && callerRole !== "executive") {
    return jsonResponse({ success: false, error: "Only HQ Admin or Executive may provision users" }, 403);
  }

  let body: ProvisionBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const tenantId = str(body.tenantId) || str(actorProfile.tenant_id);
  const displayName = str(body.displayName || body.name);
  const email = str(body.email).toLowerCase();
  const username = str(body.username).toLowerCase() || email.split("@")[0];
  const phone = str(body.phone);
  const role = str(body.role).toLowerCase();
  const agentId = str(body.agentId);
  const labId = str(body.labId).toUpperCase();
  const distributorId = str(body.distributorId);
  const territory = str(body.territory);
  const active = body.active !== false;
  const password = str(body.password) || crypto.randomUUID().slice(0, 16) + "Aa1!";

  if (!tenantId) return jsonResponse({ success: false, error: "Tenant is required" }, 400);
  if (!displayName) return jsonResponse({ success: false, error: "Name is required" }, 400);
  if (!email) return jsonResponse({ success: false, error: "Email is required" }, 400);
  if (!role || !PROVISION_ROLES.has(role)) {
    return jsonResponse({ success: false, error: "Valid role is required" }, 400);
  }
  if (role === "agent" && !agentId) {
    return jsonResponse({ success: false, error: "Agent ID is required for agent role" }, 400);
  }
  if (role === "lab" && !labId) {
    return jsonResponse({ success: false, error: "Lab ID is required for lab role" }, 400);
  }
  if (role === "distributor_admin" && !distributorId) {
    return jsonResponse({ success: false, error: "Distributor is required for Distributor Admin" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: displayName, provisioned_by: actorUserId },
  });

  if (createAuthErr || !createdAuth?.user) {
    return jsonResponse(
      { success: false, error: createAuthErr?.message || "Failed to create auth user" },
      400
    );
  }

  const newUserId = createdAuth.user.id;

  const profileRow: Record<string, unknown> = {
    user_id: newUserId,
    tenant_id: tenantId,
    role,
    username,
    display_name: displayName,
    email,
    phone: phone || null,
    active,
    agent_id: role === "agent" ? agentId : null,
    agent_name: role === "agent" ? displayName : null,
    lab_id: role === "lab" ? labId : null,
    distributor_id: role === "distributor_admin" ? distributorId : null,
    territory: territory || null,
  };

  const { data: profile, error: insertProfileErr } = await adminClient
    .from("profiles")
    .insert([profileRow])
    .select()
    .single();

  if (insertProfileErr) {
    await adminClient.auth.admin.deleteUser(newUserId);
    return jsonResponse(
      { success: false, error: insertProfileErr.message || "Failed to create profile" },
      400
    );
  }

  const directoryRow = {
    tenant_id: tenantId,
    user_code: newUserId,
    user_name: displayName,
    email,
    role: directoryRole(role),
    active,
  };

  const { error: directoryErr } = await adminClient.from("users").insert([directoryRow]);
  if (directoryErr) {
    await adminClient.from("profiles").delete().eq("user_id", newUserId);
    await adminClient.auth.admin.deleteUser(newUserId);
    return jsonResponse(
      { success: false, error: directoryErr.message || "Failed to sync user directory" },
      400
    );
  }

  const eventPayload = {
    role,
    email,
    username,
    agentId: agentId || null,
    labId: labId || null,
    distributorId: distributorId || null,
    territory: territory || null,
    loginEnabled: !LOGIN_BLOCKED_ROLES.has(role),
  };

  const { error: eventErr } = await adminClient.from("user_provisioning_events").insert([
    {
      hq_tenant_id: tenantId,
      subject_user_id: newUserId,
      event_type: "created",
      actor_user_id: actorUserId,
      payload: eventPayload,
    },
  ]);

  if (eventErr) {
    console.warn("[provision-platform-user] audit event failed:", eventErr.message);
  }

  return jsonResponse({
    success: true,
    data: {
      userId: newUserId,
      profile,
      loginEnabled: !LOGIN_BLOCKED_ROLES.has(role),
      temporaryPassword: LOGIN_BLOCKED_ROLES.has(role) ? undefined : password,
    },
  });
});
