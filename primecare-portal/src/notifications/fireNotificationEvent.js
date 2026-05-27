import { createNotificationEvent } from "@/notifications/createNotificationEvent.js";

/**
 * Fire-and-forget internal notification log (never throws to caller).
 * @param {Parameters<typeof createNotificationEvent>[0]} event
 * @param {string} [logLabel]
 */
export function fireNotificationEvent(event, logLabel = "notification") {
  void createNotificationEvent(event).catch((err) => {
    console.warn(`[${logLabel}] notification event:`, err?.message || err);
  });
}
