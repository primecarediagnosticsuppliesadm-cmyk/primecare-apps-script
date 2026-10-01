// PrimeCare Resend webhook. verify_jwt is false because Resend is not a Supabase user.
// Authenticity is the Svix signature over the raw body. Invalid signatures never touch the database.
// Does not send email and does not claim deliveries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifySvixSignature } from "./verify.js";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  const raw = await req.text();
  const verified = await verifySvixSignature({
    secret: str(Deno.env.get("RESEND_WEBHOOK_SECRET")),
    payload: raw,
    id: req.headers.get("svix-id") || "",
    timestamp: req.headers.get("svix-timestamp") || "",
    signature: req.headers.get("svix-signature") || "",
  });
  if (!verified.ok) {
    return jsonResponse({ success: false, error: "invalid_signature" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const data = body.data && typeof body.data === "object"
    ? body.data as Record<string, unknown>
    : {};
  const eventType = str(body.type);
  const providerMessageId = str(data.email_id);
  const occurredRaw = str(body.created_at) || str(data.created_at);
  const occurredAt = occurredRaw ? new Date(occurredRaw).toISOString() : "";
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    return jsonResponse({ success: false, error: "invalid_event" }, 400);
  }

  const supabaseUrl = str(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = str(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "server_configuration_missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: result, error } = await admin.rpc("record_notification_email_provider_event", {
    p_svix_id: req.headers.get("svix-id"),
    p_provider_message_id: providerMessageId,
    p_event_type: eventType,
    p_occurred_at: occurredAt,
  });
  if (error) {
    return jsonResponse({ success: false, error: "record_failed" }, 500);
  }
  return jsonResponse({ success: true, result: str(result) || "ignored" });
});
