import { supabase } from "@/api/supabaseClient.js";
import { hqDebugWarn } from "@/utils/hqDebugLog.js";
import { NOTIFICATION_CHANNELS } from "@/notifications/notificationConstants.js";
import {
  buildNotificationEventInsertRows,
  isUnknownNotificationColumnError,
} from "@/notifications/notificationEventInsert.js";

/** @type {null | "foundation" | "legacy"} */
let notificationEventsWriteShape = null;

/**
 * Internal notification event log only — records in_app + placeholder delivery rows.
 * Never calls external WhatsApp/SMS/email providers.
 * Never throws to the visit/order transaction (caller uses fire-and-forget).
 *
 * Production may still have the GAP-006 stub schema (no actor_user_id / source_module).
 * After the first PGRST204, subsequent writes use the legacy stub shape only so the
 * console does not keep logging foundation-column 400s. Apply
 * 20260816140000_notification_events_foundation_parity.sql for durable parity.
 *
 * @param {Object} event
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function createNotificationEvent(event = {}) {
  if (!supabase) {
    return { success: false, data: null, error: "Supabase is not configured" };
  }

  const built = buildNotificationEventInsertRows(event);
  if (!built.ok) {
    return { success: false, data: null, error: built.error };
  }

  try {
    let inserted = null;

    if (notificationEventsWriteShape !== "legacy") {
      const res = await supabase
        .from("notification_events")
        .insert([built.foundation])
        .select()
        .single();

      if (!res.error) {
        notificationEventsWriteShape = "foundation";
        inserted = res.data;
      } else if (isUnknownNotificationColumnError(res.error)) {
        hqDebugWarn(
          "[createNotificationEvent] foundation columns missing; using legacy stub shape:",
          res.error.message
        );
        notificationEventsWriteShape = "legacy";
      } else {
        return { success: false, data: null, error: res.error.message };
      }
    }

    if (!inserted && notificationEventsWriteShape === "legacy") {
      const res = await supabase
        .from("notification_events")
        .insert([built.legacy])
        .select()
        .single();
      if (res.error) {
        return { success: false, data: null, error: res.error.message };
      }
      inserted = res.data;
    }

    if (!inserted) {
      return { success: false, data: null, error: "notification insert returned no row" };
    }

    if (notificationEventsWriteShape === "legacy") {
      return { success: true, data: inserted, error: null };
    }

    const eventId = inserted?.event_id || inserted?.id || null;
    if (!eventId) {
      return { success: true, data: inserted, error: null };
    }

    const now = new Date().toISOString();
    const deliveryBase = NOTIFICATION_CHANNELS.map((channel) => ({
      tenant_id: built.tenantId,
      event_id: eventId,
      channel,
      recipient:
        channel === "in_app"
          ? built.foundation.target_user_id ||
            built.foundation.target_role ||
            built.foundation.target_lab_id ||
            "tenant"
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
      if (!/schema cache|column|does not exist|PGRST/i.test(logErr.message)) break;
    }

    if (logErr) {
      hqDebugWarn("[createNotificationEvent] delivery log insert:", logErr.message);
    }

    return { success: true, data: inserted, error: null };
  } catch (err) {
    return { success: false, data: null, error: err?.message || String(err) };
  }
}

/** Test helper — reset cached schema shape between unit checks. */
export function resetNotificationEventsWriteShapeForTests() {
  notificationEventsWriteShape = null;
}
