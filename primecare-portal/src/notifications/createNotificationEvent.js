import { supabase } from "@/api/supabaseClient.js";
import { hqDebugWarn } from "@/utils/hqDebugLog.js";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_SEVERITIES,
} from "@/notifications/notificationConstants.js";

function str(v) {
  return String(v ?? "").trim();
}

function normalizeTenantId(tenantId) {
  const s = str(tenantId);
  return s || null;
}

function isKnownEventType(eventType) {
  return NOTIFICATION_EVENT_TYPES.includes(str(eventType));
}

function isKnownSeverity(severity) {
  return NOTIFICATION_SEVERITIES.includes(str(severity).toLowerCase());
}

/**
 * Internal notification event log only — records in_app + placeholder delivery rows.
 * Never calls external WhatsApp/SMS/email providers.
 *
 * @param {Object} event
 * @param {string} event.eventType
 * @param {string} event.sourceModule
 * @param {string} [event.sourceId]
 * @param {string} event.tenantId
 * @param {string} [event.actorUserId]
 * @param {string} [event.targetRole]
 * @param {string} [event.targetUserId]
 * @param {string} [event.targetLabId]
 * @param {Record<string, unknown>} [event.payload]
 * @param {string} [event.severity]
 * @param {string} [event.status]
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function createNotificationEvent(event = {}) {
  if (!supabase) {
    return { success: false, data: null, error: "Supabase is not configured" };
  }

  const eventType = str(event.eventType ?? event.event_type);
  const tenantId = normalizeTenantId(event.tenantId ?? event.tenant_id);

  if (!tenantId) {
    return { success: false, data: null, error: "tenantId is required" };
  }
  if (!isKnownEventType(eventType)) {
    return { success: false, data: null, error: `Unknown event_type: ${eventType}` };
  }

  const severity = isKnownSeverity(event.severity) ? str(event.severity).toLowerCase() : "info";
  const status = str(event.status || "pending").toLowerCase();

  const row = {
    tenant_id: tenantId,
    event_type: eventType,
    source_module: str(event.sourceModule ?? event.source_module) || "system",
    source_id: str(event.sourceId ?? event.source_id) || null,
    actor_user_id: str(event.actorUserId ?? event.actor_user_id) || null,
    target_role: str(event.targetRole ?? event.target_role) || null,
    target_user_id: str(event.targetUserId ?? event.target_user_id) || null,
    target_lab_id: str(event.targetLabId ?? event.target_lab_id) || null,
    payload_json: event.payload ?? event.payload_json ?? {},
    severity,
    status,
  };

  try {
    const { data: inserted, error: insertErr } = await supabase
      .from("notification_events")
      .insert([row])
      .select()
      .single();

    if (insertErr) {
      return { success: false, data: null, error: insertErr.message };
    }

    const eventId = inserted?.event_id;
    const now = new Date().toISOString();
    const deliveryBase = NOTIFICATION_CHANNELS.map((channel) => ({
      tenant_id: tenantId,
      event_id: eventId,
      channel,
      recipient:
        channel === "in_app"
          ? row.target_user_id || row.target_role || row.target_lab_id || "tenant"
          : "placeholder",
      status: channel === "in_app" ? "logged_in_app" : "placeholder_not_sent",
      attempted_at: now,
      delivered_at: channel === "in_app" ? now : null,
    }));

    let logErr = null;
    const attempts = [
      deliveryBase.map((r) => ({
        ...r,
        provider_response: { foundation: true, liveSend: false },
        error_message: null,
      })),
      deliveryBase.map((r) => ({
        ...r,
        provider_response: { foundation: true, liveSend: false },
      })),
      deliveryBase,
    ];
    for (const rows of attempts) {
      const res = await supabase.from("notification_delivery_log").insert(rows);
      logErr = res.error;
      if (!logErr) break;
      if (!/schema cache|column/i.test(logErr.message)) break;
    }

    if (logErr) {
      hqDebugWarn("[createNotificationEvent] delivery log insert:", logErr.message);
    }

    return { success: true, data: inserted, error: null };
  } catch (err) {
    return { success: false, data: null, error: err?.message || String(err) };
  }
}
