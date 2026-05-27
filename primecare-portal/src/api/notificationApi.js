import { supabase } from "@/api/supabaseClient.js";
import { NOTIFICATION_EVENT_STATUSES } from "@/notifications/notificationConstants.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {Object} [filters]
 * @param {string} [filters.tenantId]
 * @param {string} [filters.severity]
 * @param {string} [filters.status]
 * @param {string} [filters.sourceModule]
 * @param {string} [filters.eventType]
 * @param {number} [filters.limit]
 */
export async function getNotificationEventsRead(filters = {}) {
  if (!supabase) {
    return { success: false, data: [], error: "Supabase is not configured" };
  }

  try {
    let query = supabase
      .from("notification_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(filters.limit) || 100, 200));

    const tenantId = str(filters.tenantId ?? filters.tenant_id);
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    if (filters.severity) {
      query = query.eq("severity", str(filters.severity).toLowerCase());
    }
    if (filters.status) {
      query = query.eq("status", str(filters.status).toLowerCase());
    }
    if (filters.sourceModule) {
      query = query.eq("source_module", str(filters.sourceModule));
    }
    if (filters.eventType) {
      query = query.eq("event_type", str(filters.eventType));
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, data: [], error: error.message };
    }

    const events = Array.isArray(data) ? data : [];
    const eventIds = events.map((e) => e.event_id).filter(Boolean);

    let deliveriesByEvent = new Map();
    if (eventIds.length > 0) {
      const { data: logs, error: logErr } = await supabase
        .from("notification_delivery_log")
        .select("event_id, channel, status, attempted_at, delivered_at")
        .in("event_id", eventIds);

      if (!logErr && Array.isArray(logs)) {
        for (const log of logs) {
          const list = deliveriesByEvent.get(log.event_id) || [];
          list.push(log);
          deliveriesByEvent.set(log.event_id, list);
        }
      }
    }

    const channelFilter = str(filters.channel).toLowerCase();
    const enriched = events
      .map((row) => ({
        ...row,
        deliveries: deliveriesByEvent.get(row.event_id) || [],
      }))
      .filter((row) => {
        if (!channelFilter) return true;
        return row.deliveries.some((d) => str(d.channel).toLowerCase() === channelFilter);
      });

    return { success: true, data: enriched, error: null };
  } catch (err) {
    return { success: false, data: [], error: err?.message || String(err) };
  }
}

/**
 * Mark notification event read or acknowledged (tenant-safe via RLS).
 * @param {Object} params
 * @param {string} params.eventId
 * @param {'read'|'acknowledged'} params.status
 */
export async function updateNotificationEventStatusWrite({ eventId, status }) {
  if (!supabase) {
    return { success: false, data: null, error: "Supabase is not configured" };
  }

  const nextStatus = str(status).toLowerCase();
  if (!NOTIFICATION_EVENT_STATUSES.includes(nextStatus)) {
    return { success: false, data: null, error: "Invalid status" };
  }
  if (nextStatus === "pending" || nextStatus === "archived") {
    return { success: false, data: null, error: "Use read or acknowledged only" };
  }

  const id = str(eventId);
  if (!id) {
    return { success: false, data: null, error: "eventId is required" };
  }

  try {
    const { data, error } = await supabase
      .from("notification_events")
      .update({ status: nextStatus })
      .eq("event_id", id)
      .select()
      .single();

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    return { success: true, data, error: null };
  } catch (err) {
    return { success: false, data: null, error: err?.message || String(err) };
  }
}
