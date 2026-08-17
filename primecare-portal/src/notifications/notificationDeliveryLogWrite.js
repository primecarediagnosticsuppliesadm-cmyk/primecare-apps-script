import { supabase } from "@/api/supabaseClient.js";

/**
 * Sole browser write path for notification_delivery_log.
 * Always uses the canonical authenticated Supabase client (apikey + Authorization).
 * Do not call this table via raw HTTP clients or hand-built REST URLs.
 *
 * @param {object[]} rows
 * @returns {Promise<{ error: { message: string } | null }>}
 */
export async function insertNotificationDeliveryLogRows(rows) {
  if (!supabase) {
    return { error: { message: "Supabase is not configured" } };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: null };
  }

  // Touch session so Authorization is current; client always attaches apikey from supabaseKey.
  try {
    await supabase.auth.getSession();
  } catch {
    // Session read is best-effort; insert still goes through canonical client.
  }

  return supabase.from("notification_delivery_log").insert(rows);
}
