// PrimeCare PN-1B2 — dispatch queued notification emails (QA only).
// Not an open relay: caller to/subject/body/html are ignored.
// Auth: Authorization Bearer EMAIL_DISPATCH_CRON_SECRET only. User JWT is insufficient.
// EMAIL_ENABLED=false → do not claim, do not call Resend.
// No cron in this slice. Manual invoke only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import {
  CLAIM_BATCH_SIZE,
  MAX_ATTEMPTS,
  classifyProviderError,
  evaluateProductionCertificationEnv,
  evaluateProductionCertificationRow,
  evaluateStage3eEnv,
  isCertificationRequest,
  isProductionBatchClaimForbidden,
  isProductionDispatchableEmail,
  isStage3eEventType,
  isStage3eLabNameEligible,
  isStage3eRecipientRole,
  isStage3eRequest,
  isStage3fActivatedCopyRequest,
  maskEmail,
  nextAttemptAtIso,
  NON_DISPATCHABLE_DOMAIN,
  payloadText,
  renderCertificationEmail,
  renderForEventType,
  resolveQaRecipient,
  shouldClaimRows,
  stage3eDeniedDelivery,
  str,
} from "./policy.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const len = Math.max(left.length, right.length, 1);
  let out = left.length === right.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    out |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return out === 0 && a.length > 0 && b.length > 0;
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

function env(name: string): string {
  return str(Deno.env.get(name));
}

function logSafe(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ src: "dispatch-notification-email", ...fields }));
}

async function resolveAssignedName(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const agentId = str(payload.assigned_agent_id);
  if (!tenantId || !agentId) return "";
  const { data } = await admin
    .from("profiles")
    .select("display_name,agent_name,agent_id")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .limit(1)
    .maybeSingle();
  return str(data?.display_name) || str(data?.agent_name) || "";
}

async function sendResend(args: {
  apiKey: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  deliveryId: string;
}): Promise<{ ok: boolean; status: number; id: string; error: string; kind?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const from = args.fromName ? `${args.fromName} <${args.fromAddress}>` : args.fromAddress;
    const body: Record<string, unknown> = {
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html,
    };
    if (args.replyTo) body.reply_to = args.replyTo;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": args.deliveryId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    const id = str((json as { id?: string }).id);
    const err =
      str((json as { message?: string }).message) ||
      str((json as { error?: { message?: string } }).error?.message);
    return { ok: res.ok && Boolean(id), status: res.status, id, error: err };
  } catch (err) {
    const name = str((err as { name?: string })?.name);
    const kind = name === "AbortError" ? "timeout" : "network";
    return { ok: false, status: 0, id: "", error: kind, kind };
  } finally {
    clearTimeout(timer);
  }
}

function failClosed(reason: string, extra: Record<string, unknown> = {}) {
  logSafe({ event: "certification_fail_closed", reason, ...extra });
  return jsonResponse({
    success: false,
    disabled: false,
    claimed: 0,
    processed: [],
    error: "certification_fail_closed",
    reason,
  }, 200);
}

async function handleProductionCertification(admin: ReturnType<typeof createClient>) {
  const envGate = evaluateProductionCertificationEnv({
    emailEnabled: env("EMAIL_ENABLED"),
    appEnv: env("APP_ENV"),
    qaMode: env("EMAIL_QA_MODE"),
    certificationMode: true,
    prodTestRecipient: env("EMAIL_PROD_TEST_RECIPIENT"),
  });
  if (!envGate.ok) {
    return failClosed(envGate.reason);
  }

  const approved = str(envGate.approvedRecipient);
  const { data: created, error: createErr } = await admin.rpc(
    "create_pn_email_stage2_certification_delivery",
    { p_recipient_email: approved }
  );
  if (createErr) {
    return failClosed("certification_create_failed");
  }
  const createdRow = Array.isArray(created) ? created[0] : created;
  const certDeliveryId = str(createdRow?.delivery_id);
  if (!certDeliveryId) {
    return failClosed("certification_create_failed");
  }

  const { data: claimed, error: claimErr } = await admin.rpc(
    "claim_notification_email_certification_delivery",
    { p_delivery_id: certDeliveryId }
  );
  if (claimErr) {
    return failClosed("certification_claim_failed");
  }
  const rows = Array.isArray(claimed) ? claimed : claimed ? [claimed] : [];
  if (rows.length !== 1) {
    return failClosed("certification_claim_empty");
  }
  const row = rows[0];
  const outcome = str(row.claim_outcome);
  const deliveryId = str(row.delivery_id);
  if (outcome === "already_sent") {
    logSafe({
      event: "certification_already_sent",
      delivery_id: deliveryId,
      provider_message_id: str(row.provider_message_id),
    });
    return jsonResponse({
      success: true,
      disabled: false,
      claimed: 0,
      processed: [{ delivery_id: deliveryId, status: "sent", skipped: "already_sent" }],
    });
  }
  if (outcome !== "claimed") {
    return failClosed(outcome || "not_claimable", { delivery_id: deliveryId });
  }

  const rowGate = evaluateProductionCertificationRow({
    certificationKind: str(row.certification_kind),
    intendedEmail: str(row.recipient_email),
    approvedRecipient: approved,
    deliveryId,
  });
  if (!rowGate.ok) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "skipped",
      p_error_code: rowGate.reason,
      p_error_summary: rowGate.reason,
    });
    return failClosed(rowGate.reason, { delivery_id: deliveryId });
  }

  if (
    !isProductionDispatchableEmail(str(row.recipient_email))
    || !isProductionDispatchableEmail(rowGate.providerTo)
  ) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "skipped",
      p_error_code: NON_DISPATCHABLE_DOMAIN,
      p_error_summary: NON_DISPATCHABLE_DOMAIN,
    });
    return failClosed(NON_DISPATCHABLE_DOMAIN, { delivery_id: deliveryId });
  }

  const apiKey = env("EMAIL_PROVIDER_API_KEY");
  const fromAddress = env("EMAIL_FROM_ADDRESS");
  if (!apiKey || !fromAddress) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "failed",
      p_error_code: "provider_unconfigured",
      p_error_summary: "provider_unconfigured",
      p_provider_recipient: rowGate.providerTo,
    });
    return failClosed("provider_unconfigured", { delivery_id: deliveryId });
  }

  const rendered = renderCertificationEmail({
    appPublicUrl: env("APP_PUBLIC_URL") || "https://app.primecarediagnostics.in",
  });
  const send = await sendResend({
    apiKey,
    fromName: env("EMAIL_FROM_NAME") || "PrimeCare",
    fromAddress,
    replyTo: env("EMAIL_REPLY_TO"),
    to: rowGate.providerTo,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    deliveryId,
  });

  if (send.ok) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_provider_message_id: send.id,
      p_provider_recipient: rowGate.providerTo,
    });
    logSafe({
      event: "certification_sent",
      delivery_id: deliveryId,
      intended: maskEmail(str(row.recipient_email)),
      actual: maskEmail(rowGate.providerTo),
      provider_message_id: send.id,
    });
    return jsonResponse({
      success: true,
      disabled: false,
      claimed: 1,
      processed: [{
        delivery_id: deliveryId,
        status: "sent",
        provider_message_id: send.id,
        actual: maskEmail(rowGate.providerTo),
        intended: maskEmail(str(row.recipient_email)),
      }],
    });
  }

  const classified = classifyProviderError(send.status, send.kind);
  await admin.rpc("finalize_notification_email_delivery", {
    p_delivery_id: deliveryId,
    p_status: "failed",
    p_error_code: classified.errorCode,
    p_error_summary: classified.errorCode,
    p_provider_error: String(send.status || send.kind || "error"),
    p_provider_recipient: rowGate.providerTo,
  });
  logSafe({
    event: "certification_failed",
    delivery_id: deliveryId,
    error_code: classified.errorCode,
    actual: maskEmail(rowGate.providerTo),
  });
  return jsonResponse({
    success: false,
    disabled: false,
    claimed: 1,
    processed: [{
      delivery_id: deliveryId,
      status: "failed",
      error_code: classified.errorCode,
    }],
  }, 200);
}

async function handleStage3eLifecycle(
  admin: ReturnType<typeof createClient>,
  requestedDeliveryId: string,
) {
  const envGate = evaluateStage3eEnv({
    emailEnabled: env("EMAIL_ENABLED"),
    appEnv: env("APP_ENV"),
    qaMode: env("EMAIL_QA_MODE"),
    stage3eMode: true,
  });
  if (!envGate.ok) {
    return failClosed(envGate.reason);
  }

  const denied = stage3eDeniedDelivery(requestedDeliveryId);
  if (denied.denied) {
    return failClosed(denied.reason, { delivery_id: requestedDeliveryId || null });
  }

  const { data: claimed, error: claimErr } = await admin.rpc(
    "claim_notification_email_stage3e_delivery",
    { p_delivery_id: requestedDeliveryId },
  );
  if (claimErr) {
    return failClosed("stage3e_claim_failed");
  }
  const rows = Array.isArray(claimed) ? claimed : claimed ? [claimed] : [];
  if (rows.length !== 1) {
    return failClosed("not_found", { delivery_id: requestedDeliveryId });
  }
  const row = rows[0];
  const outcome = str(row.claim_outcome);
  const deliveryId = str(row.delivery_id);
  if (outcome === "already_sent") {
    logSafe({
      event: "stage3e_already_sent",
      delivery_id: deliveryId,
      provider_message_id: str(row.provider_message_id),
    });
    return jsonResponse({
      success: true,
      disabled: false,
      claimed: 0,
      processed: [{ delivery_id: deliveryId, status: "sent", skipped: "already_sent" }],
    });
  }
  if (outcome !== "claimed") {
    return failClosed(outcome || "not_claimable", { delivery_id: deliveryId || requestedDeliveryId });
  }

  const eventType = str(row.event_type);
  const payload = row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
  const labName = payloadText(payload, "lab_name");
  const intended = str(row.recipient_email);
  const role = str(row.recipient_role);

  if (
    !isStage3eEventType(eventType)
    || !isStage3eLabNameEligible(labName)
    || !isStage3eRecipientRole(eventType, role)
    || !isProductionDispatchableEmail(intended)
  ) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "skipped",
      p_error_code: "stage3e_row_gate",
      p_error_summary: "stage3e_row_gate",
    });
    return failClosed("stage3e_row_gate", { delivery_id: deliveryId });
  }

  const apiKey = env("EMAIL_PROVIDER_API_KEY");
  const fromAddress = env("EMAIL_FROM_ADDRESS");
  if (!apiKey || !fromAddress) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "failed",
      p_error_code: "provider_unconfigured",
      p_error_summary: "provider_unconfigured",
      p_provider_recipient: intended,
    });
    return failClosed("provider_unconfigured", { delivery_id: deliveryId });
  }

  const assignedName = await resolveAssignedName(admin, str(row.tenant_id), payload as Record<string, unknown>);
  const rendered = renderForEventType(eventType, {
    payload,
    appPublicUrl: env("APP_PUBLIC_URL") || "https://app.primecarediagnostics.in",
    assignedName,
  });
  if (!rendered.ok) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "skipped",
      p_error_code: rendered.errorCode,
      p_error_summary: rendered.errorCode,
    });
    return failClosed(rendered.errorCode || "unsupported_event_type", { delivery_id: deliveryId });
  }

  const send = await sendResend({
    apiKey,
    fromName: env("EMAIL_FROM_NAME") || "PrimeCare",
    fromAddress,
    replyTo: env("EMAIL_REPLY_TO"),
    to: intended,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    deliveryId,
  });

  if (send.ok) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_provider_message_id: send.id,
      p_provider_recipient: intended,
    });
    logSafe({
      event: "stage3e_sent",
      delivery_id: deliveryId,
      event_type: eventType,
      intended: maskEmail(intended),
      actual: maskEmail(intended),
      provider_message_id: send.id,
    });
    return jsonResponse({
      success: true,
      disabled: false,
      claimed: 1,
      processed: [{
        delivery_id: deliveryId,
        status: "sent",
        provider_message_id: send.id,
        actual: maskEmail(intended),
        intended: maskEmail(intended),
        event_type: eventType,
      }],
    });
  }

  const classified = classifyProviderError(send.status, send.kind);
  await admin.rpc("finalize_notification_email_delivery", {
    p_delivery_id: deliveryId,
    p_status: "failed",
    p_error_code: classified.errorCode,
    p_error_summary: classified.errorCode,
    p_provider_error: String(send.status || send.kind || "error"),
    p_provider_recipient: intended,
  });
  logSafe({
    event: "stage3e_failed",
    delivery_id: deliveryId,
    error_code: classified.errorCode,
    actual: maskEmail(intended),
  });
  return jsonResponse({
    success: false,
    disabled: false,
    claimed: 1,
    processed: [{
      delivery_id: deliveryId,
      status: "failed",
      error_code: classified.errorCode,
    }],
  }, 200);
}

async function handleStage3fActivatedCopy(admin: ReturnType<typeof createClient>) {
  const envGate = evaluateStage3eEnv({
    emailEnabled: env("EMAIL_ENABLED"),
    appEnv: env("APP_ENV"),
    qaMode: env("EMAIL_QA_MODE"),
    stage3eMode: true,
  });
  if (!envGate.ok) {
    return failClosed(envGate.reason);
  }

  const { data: created, error: createErr } = await admin.rpc(
    "create_pn_email_stage3f_activated_founder_copy",
  );
  if (createErr) {
    return failClosed("stage3f_copy_create_failed");
  }
  const createdRow = Array.isArray(created) ? created[0] : created;
  const createOutcome = str(createdRow?.create_outcome);
  const createdId = str(createdRow?.delivery_id);
  if (!createdId) {
    return failClosed(createOutcome || "stage3f_copy_create_failed");
  }
  if (createOutcome === "already_sent") {
    return jsonResponse({
      success: true,
      disabled: false,
      claimed: 0,
      processed: [{ delivery_id: createdId, status: "sent", skipped: "already_sent" }],
    });
  }

  const denied = stage3eDeniedDelivery(createdId);
  if (denied.denied) {
    return failClosed(denied.reason, { delivery_id: createdId });
  }

  const { data: claimed, error: claimErr } = await admin.rpc(
    "claim_notification_email_stage3f_activated_copy",
    { p_delivery_id: createdId },
  );
  if (claimErr) {
    return failClosed("stage3f_copy_claim_failed");
  }
  const rows = Array.isArray(claimed) ? claimed : claimed ? [claimed] : [];
  if (rows.length !== 1) {
    return failClosed("not_found", { delivery_id: createdId });
  }
  const row = rows[0];
  const outcome = str(row.claim_outcome);
  const deliveryId = str(row.delivery_id);
  if (outcome === "already_sent") {
    return jsonResponse({
      success: true,
      disabled: false,
      claimed: 0,
      processed: [{ delivery_id: deliveryId, status: "sent", skipped: "already_sent" }],
    });
  }
  if (outcome !== "claimed") {
    return failClosed(outcome || "not_claimable", { delivery_id: deliveryId || createdId });
  }

  const eventType = str(row.event_type);
  const payload = row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
  const labName = payloadText(payload, "lab_name");
  const intended = str(row.recipient_email);
  const role = str(row.recipient_role);
  const kind = str(row.certification_kind);

  if (
    eventType !== "prospect_activated"
    || kind !== "pn_email_stage3f_activated_copy"
    || role !== "executive"
    || !isStage3eLabNameEligible(labName)
    || !isProductionDispatchableEmail(intended)
  ) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "skipped",
      p_error_code: "stage3f_copy_row_gate",
      p_error_summary: "stage3f_copy_row_gate",
    });
    return failClosed("stage3f_copy_row_gate", { delivery_id: deliveryId });
  }

  const apiKey = env("EMAIL_PROVIDER_API_KEY");
  const fromAddress = env("EMAIL_FROM_ADDRESS");
  if (!apiKey || !fromAddress) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "failed",
      p_error_code: "provider_unconfigured",
      p_error_summary: "provider_unconfigured",
      p_provider_recipient: intended,
    });
    return failClosed("provider_unconfigured", { delivery_id: deliveryId });
  }

  const assignedName = await resolveAssignedName(admin, str(row.tenant_id), payload as Record<string, unknown>);
  const rendered = renderForEventType(eventType, {
    payload,
    appPublicUrl: env("APP_PUBLIC_URL") || "https://app.primecarediagnostics.in",
    assignedName,
  });
  if (!rendered.ok) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "skipped",
      p_error_code: rendered.errorCode,
      p_error_summary: rendered.errorCode,
    });
    return failClosed(rendered.errorCode || "unsupported_event_type", { delivery_id: deliveryId });
  }

  const send = await sendResend({
    apiKey,
    fromName: env("EMAIL_FROM_NAME") || "PrimeCare",
    fromAddress,
    replyTo: env("EMAIL_REPLY_TO"),
    to: intended,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    deliveryId,
  });

  if (send.ok) {
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_provider_message_id: send.id,
      p_provider_recipient: intended,
    });
    logSafe({
      event: "stage3f_activated_copy_sent",
      delivery_id: deliveryId,
      event_type: eventType,
      intended: maskEmail(intended),
      actual: maskEmail(intended),
      provider_message_id: send.id,
    });
    return jsonResponse({
      success: true,
      disabled: false,
      claimed: 1,
      processed: [{
        delivery_id: deliveryId,
        status: "sent",
        provider_message_id: send.id,
        actual: maskEmail(intended),
        intended: maskEmail(intended),
        event_type: eventType,
        certification_kind: kind,
      }],
    });
  }

  const classified = classifyProviderError(send.status, send.kind);
  await admin.rpc("finalize_notification_email_delivery", {
    p_delivery_id: deliveryId,
    p_status: "failed",
    p_error_code: classified.errorCode,
    p_error_summary: classified.errorCode,
    p_provider_error: String(send.status || send.kind || "error"),
    p_provider_recipient: intended,
  });
  return jsonResponse({
    success: false,
    disabled: false,
    claimed: 1,
    processed: [{
      delivery_id: deliveryId,
      status: "failed",
      error_code: classified.errorCode,
    }],
  }, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  const cronSecret = env("EMAIL_DISPATCH_CRON_SECRET");
  const stage3eSecret = env("EMAIL_STAGE3E_INVOKE_SECRET");
  const token = bearerToken(req);
  const cronOk = Boolean(cronSecret) && timingSafeEqual(token, cronSecret);
  const stage3eOk = Boolean(stage3eSecret) && timingSafeEqual(token, stage3eSecret);

  // Open-relay fields are parsed only to prove they are ignored.
  // Caller to/subject/html/delivery_id never select the certification row.
  // Stage 3E exact-row mode is the only path that reads caller delivery_id;
  // to/subject/html/event_type still never become provider payload.
  let ignoredTo = "";
  let requestMode = "";
  let requestedDeliveryId = "";
  let ignoredEventType = "";
  try {
    const body = await req.json();
    ignoredTo = str(body?.to) || str(body?.subject) || str(body?.body) || str(body?.html);
    requestMode = str(body?.mode);
    requestedDeliveryId = str(body?.delivery_id);
    ignoredEventType = str(body?.event_type);
  } catch {
    ignoredTo = "";
    requestMode = "";
    requestedDeliveryId = "";
    ignoredEventType = "";
  }
  if (ignoredTo || ignoredEventType) {
    logSafe({ event: "ignore_caller_payload" });
  }

  const stage3eMode = isStage3eRequest({ mode: requestMode });
  const stage3fCopyMode = isStage3fActivatedCopyRequest({ mode: requestMode });
  if (stage3fCopyMode) {
    if (!stage3eOk) {
      logSafe({ event: "auth_denied" });
      return jsonResponse({ success: false, error: "unauthorized" }, 401);
    }
  } else if (!cronOk && !(stage3eOk && stage3eMode)) {
    logSafe({ event: "auth_denied" });
    return jsonResponse({ success: false, error: "unauthorized" }, 401);
  }

  if (!shouldClaimRows(env("EMAIL_ENABLED"))) {
    logSafe({ event: "disabled_no_claim" });
    return jsonResponse({ success: true, disabled: true, claimed: 0, processed: [] });
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "server_configuration_missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (isStage3fActivatedCopyRequest({ mode: requestMode })) {
    return await handleStage3fActivatedCopy(admin);
  }

  if (isStage3eRequest({ mode: requestMode })) {
    return await handleStage3eLifecycle(admin, requestedDeliveryId);
  }

  if (isCertificationRequest({ mode: requestMode })) {
    return await handleProductionCertification(admin);
  }

  if (isProductionBatchClaimForbidden({
    appEnv: env("APP_ENV"),
    qaMode: env("EMAIL_QA_MODE"),
  })) {
    logSafe({ event: "production_freeze_batch_forbidden" });
    return jsonResponse({
      success: false,
      disabled: false,
      claimed: 0,
      processed: [],
      error: "production_freeze_batch_forbidden",
    });
  }

  const { data: claimed, error: claimErr } = await admin.rpc("claim_notification_email_deliveries", {
    p_limit: CLAIM_BATCH_SIZE,
  });
  if (claimErr) {
    logSafe({ event: "claim_failed", error_code: "claim_rpc" });
    return jsonResponse({ success: false, error: "claim_failed" }, 500);
  }

  const rows = Array.isArray(claimed) ? claimed : [];
  const processed: Record<string, unknown>[] = [];

  for (const row of rows) {
    const deliveryId = str(row.delivery_id);
    const eventId = str(row.event_id);
    const recipientUserId = str(row.recipient_user_id);
    const intended = str(row.recipient_email);
    const attempt = Number(row.attempt_count) || 0;
    const eventType = str(row.event_type);
    const payload = row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};

    const baseLog = {
      delivery_id: deliveryId,
      event_id: eventId,
      recipient_user_id: recipientUserId || null,
      intended: maskEmail(intended),
      attempt,
      event_type: eventType,
    };

    if (str(row.provider_message_id)) {
      await admin.rpc("finalize_notification_email_delivery", {
        p_delivery_id: deliveryId,
        p_status: "sent",
        p_provider_message_id: str(row.provider_message_id),
      });
      logSafe({ ...baseLog, status: "sent", error_code: "already_sent" });
      processed.push({ delivery_id: deliveryId, status: "sent", skipped: "already_sent" });
      continue;
    }

    if (!isProductionDispatchableEmail(intended)) {
      await admin.rpc("finalize_notification_email_delivery", {
        p_delivery_id: deliveryId,
        p_status: "skipped",
        p_error_code: NON_DISPATCHABLE_DOMAIN,
        p_error_summary: NON_DISPATCHABLE_DOMAIN,
      });
      logSafe({ ...baseLog, status: "skipped", error_code: NON_DISPATCHABLE_DOMAIN, actual: "***" });
      processed.push({
        delivery_id: deliveryId,
        status: "skipped",
        error_code: NON_DISPATCHABLE_DOMAIN,
      });
      continue;
    }

    const qa = resolveQaRecipient({
      intendedEmail: intended,
      qaMode: env("EMAIL_QA_MODE"),
      appEnv: env("APP_ENV"),
      allowlistRaw: env("EMAIL_QA_ALLOWLIST"),
      exactAllowlistRaw: env("EMAIL_QA_EXACT_ALLOWLIST"),
      testRecipient: env("EMAIL_TEST_RECIPIENT"),
    });

    if (qa.action === "suppress") {
      await admin.rpc("finalize_notification_email_delivery", {
        p_delivery_id: deliveryId,
        p_status: "skipped",
        p_error_code: qa.reason,
        p_error_summary: qa.reason,
      });
      logSafe({ ...baseLog, status: "skipped", error_code: qa.reason, actual: "***" });
      processed.push({ delivery_id: deliveryId, status: "skipped", error_code: qa.reason });
      continue;
    }

    if (!isProductionDispatchableEmail(qa.providerTo)) {
      await admin.rpc("finalize_notification_email_delivery", {
        p_delivery_id: deliveryId,
        p_status: "skipped",
        p_error_code: NON_DISPATCHABLE_DOMAIN,
        p_error_summary: NON_DISPATCHABLE_DOMAIN,
      });
      logSafe({
        ...baseLog,
        status: "skipped",
        error_code: NON_DISPATCHABLE_DOMAIN,
        actual: maskEmail(qa.providerTo),
      });
      processed.push({
        delivery_id: deliveryId,
        status: "skipped",
        error_code: NON_DISPATCHABLE_DOMAIN,
      });
      continue;
    }

    const assignedName = await resolveAssignedName(admin, str(row.tenant_id), payload as Record<string, unknown>);
    const rendered = renderForEventType(eventType, {
      payload,
      appPublicUrl: env("APP_PUBLIC_URL") || "https://primecare-portal.vercel.app",
      assignedName,
    });
    if (!rendered.ok) {
      await admin.rpc("finalize_notification_email_delivery", {
        p_delivery_id: deliveryId,
        p_status: "skipped",
        p_error_code: rendered.errorCode,
        p_error_summary: rendered.errorCode,
      });
      logSafe({ ...baseLog, status: "skipped", error_code: rendered.errorCode });
      processed.push({ delivery_id: deliveryId, status: "skipped", error_code: rendered.errorCode });
      continue;
    }

    const apiKey = env("EMAIL_PROVIDER_API_KEY");
    const fromAddress = env("EMAIL_FROM_ADDRESS");
    if (!apiKey || !fromAddress) {
      const nextAt = nextAttemptAtIso(attempt);
      await admin.rpc("finalize_notification_email_delivery", {
        p_delivery_id: deliveryId,
        p_status: "failed",
        p_error_code: "provider_unconfigured",
        p_error_summary: "provider_unconfigured",
        p_next_attempt_at: nextAt,
        p_provider_recipient: qa.providerTo,
      });
      logSafe({ ...baseLog, status: "failed", error_code: "provider_unconfigured", actual: maskEmail(qa.providerTo) });
      processed.push({ delivery_id: deliveryId, status: "failed", error_code: "provider_unconfigured" });
      continue;
    }

    const send = await sendResend({
      apiKey,
      fromName: env("EMAIL_FROM_NAME") || "PrimeCare QA",
      fromAddress,
      replyTo: env("EMAIL_REPLY_TO"),
      to: qa.providerTo,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      deliveryId,
    });

    if (send.ok) {
      await admin.rpc("finalize_notification_email_delivery", {
        p_delivery_id: deliveryId,
        p_status: "sent",
        p_provider_message_id: send.id,
        p_provider_recipient: qa.providerTo,
      });
      logSafe({
        ...baseLog,
        status: "sent",
        actual: maskEmail(qa.providerTo),
        provider_message_id: send.id,
      });
      processed.push({
        delivery_id: deliveryId,
        status: "sent",
        provider_message_id: send.id,
        actual: maskEmail(qa.providerTo),
        intended: maskEmail(intended),
      });
      continue;
    }

    const classified = classifyProviderError(send.status, send.kind);
    const retryable = classified.retryable && attempt < MAX_ATTEMPTS;
    const nextAt = retryable ? nextAttemptAtIso(attempt) : null;
    await admin.rpc("finalize_notification_email_delivery", {
      p_delivery_id: deliveryId,
      p_status: retryable ? "failed" : "failed",
      p_error_code: classified.errorCode,
      p_error_summary: classified.errorCode,
      p_next_attempt_at: nextAt,
      p_provider_error: String(send.status || send.kind || "error"),
      p_provider_recipient: qa.providerTo,
    });
    logSafe({
      ...baseLog,
      status: "failed",
      error_code: classified.errorCode,
      actual: maskEmail(qa.providerTo),
      retryable,
    });
    processed.push({
      delivery_id: deliveryId,
      status: "failed",
      error_code: classified.errorCode,
      retryable,
    });
  }

  return jsonResponse({
    success: true,
    disabled: false,
    claimed: rows.length,
    processed,
  });
});
