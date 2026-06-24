// PrimeCare HQ: admin temp-password reset (no email delivery required).
// Deploy with Supabase CLI. Requires SUPABASE_SERVICE_ROLE_KEY in function secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGIN_BLOCKED_ROLES = new Set<string>();

type ResetBody = {
  tenantId?: string;
  subjectUserId?: string;
  userId?: string;
  email?: string;
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

function generateTemporaryPassword(): string {
  const core = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${core}Aa1!`;
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

  const { data: actorProfile, error: actorProfileErr } = await userClient
    .from("profiles")
    .select("tenant_id, role, active")
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (actorProfileErr || !actorProfile) {
    return jsonResponse({ success: false, error: "Caller profile not found" }, 403);
  }
  if (actorProfile.active !== true) {
    return jsonResponse({ success: false, error: "Caller profile inactive" }, 403);
  }

  const callerRole = str(actorProfile.role).toLowerCase();
  if (callerRole !== "admin" && callerRole !== "executive") {
    return jsonResponse(
      { success: false, error: "Only HQ Admin or Executive may reset passwords" },
      403
    );
  }

  let body: ResetBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const hqTenantId = str(body.tenantId) || str(actorProfile.tenant_id);
  const subjectUserId = str(body.subjectUserId ?? body.userId);
  const email = str(body.email).toLowerCase();

  if (!hqTenantId) {
    return jsonResponse({ success: false, error: "Tenant is required" }, 400);
  }
  if (!subjectUserId && !email) {
    return jsonResponse({ success: false, error: "Subject user id or email is required" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let profileQuery = adminClient
    .from("profiles")
    .select("user_id, tenant_id, role, email, active, display_name")
    .eq("tenant_id", hqTenantId);

  if (subjectUserId) {
    profileQuery = profileQuery.eq("user_id", subjectUserId);
  } else {
    profileQuery = profileQuery.ilike("email", email);
  }

  const { data: subjectProfiles, error: subjectLookupErr } = await profileQuery.limit(2);

  if (subjectLookupErr) {
    return jsonResponse(
      { success: false, error: subjectLookupErr.message || "Failed to look up user" },
      400
    );
  }

  if (!subjectProfiles?.length) {
    return jsonResponse({ success: false, error: "User profile not found" }, 404);
  }
  if (subjectProfiles.length > 1) {
    return jsonResponse({ success: false, error: "Multiple users match this email" }, 400);
  }

  const subjectProfile = subjectProfiles[0];
  const targetUserId = str(subjectProfile.user_id);
  const targetRole = str(subjectProfile.role).toLowerCase();

  if (LOGIN_BLOCKED_ROLES.has(targetRole)) {
    return jsonResponse(
      {
        success: false,
        error: "Distributor Admin is directory-only and cannot receive a login password",
      },
      400
    );
  }
  if (subjectProfile.active !== true) {
    return jsonResponse({ success: false, error: "Cannot reset password for inactive user" }, 400);
  }

  const temporaryPassword = generateTemporaryPassword();

  const { data: updatedAuth, error: updateErr } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    {
      password: temporaryPassword,
      email_confirm: true,
    }
  );

  if (updateErr || !updatedAuth?.user) {
    return jsonResponse(
      { success: false, error: updateErr?.message || "Failed to update auth password" },
      400
    );
  }

  const { error: eventErr } = await adminClient.from("user_provisioning_events").insert([
    {
      hq_tenant_id: hqTenantId,
      subject_user_id: targetUserId,
      event_type: "password_reset",
      actor_user_id: actorUserId,
      payload: {
        schemaVersion: 1,
        status: "success",
        recordedAt: new Date().toISOString(),
        action: "password_reset",
        method: "admin_temp_password",
        subjectEmail: str(subjectProfile.email) || email || null,
        subjectRole: targetRole,
        source: "reset-platform-user-password",
      },
    },
  ]);

  if (eventErr) {
    console.warn("[reset-platform-user-password] audit event failed:", eventErr.message);
  }

  return jsonResponse({
    success: true,
    data: {
      userId: targetUserId,
      email: updatedAuth.user.email || str(subjectProfile.email),
      displayName: str(subjectProfile.display_name),
      temporaryPassword,
    },
  });
});
