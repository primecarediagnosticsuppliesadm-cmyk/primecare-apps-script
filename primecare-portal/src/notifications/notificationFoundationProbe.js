import { supabase } from "@/api/supabaseClient.js";
import { isNotificationsFoundationEnabled } from "@/config/notificationFoundation.js";

export const NOTIFICATION_FOUNDATION_TABLES = [
  "notification_events",
  "notification_templates",
  "notification_preferences",
  "notification_delivery_log",
];

const SETUP_PENDING_MESSAGE = "Notification Foundation tables not installed yet";
const SCHEMA_CACHE_MESSAGE = "Notification tables may need schema cache refresh";
const DISABLED_MESSAGE =
  "Notification Foundation probes skipped (set VITE_NOTIFICATIONS_FOUNDATION_ENABLED=true after migration)";

/**
 * @param {string} tableName
 */
export function isNotificationFoundationTable(tableName) {
  return NOTIFICATION_FOUNDATION_TABLES.includes(tableName);
}

/**
 * @param {string|null|undefined} message
 * @returns {'missing_table'|'schema_cache'|'probe_error'|'unknown'}
 */
export function classifyNotificationTableError(message) {
  const m = String(message || "").toLowerCase();
  if (!m) return "unknown";
  if (m.includes("schema cache") && (m.includes("could not find") || m.includes("not find"))) {
    return "schema_cache";
  }
  if (
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("could not find table") ||
    m.includes("pgrst205") ||
    (m.includes("relation") && m.includes("not exist"))
  ) {
    return "missing_table";
  }
  return "probe_error";
}

/**
 * @typedef {'disabled'|'setup_pending'|'schema_cache'|'ready'|'probe_error'} NotificationFoundationMode
 */

/**
 * Resolve whether notification tables are installed and probes should run.
 * @returns {Promise<{
 *   mode: NotificationFoundationMode,
 *   enabled: boolean,
 *   tablesExist: boolean,
 *   probeRequired: boolean,
 *   message: string,
 *   suggestedFix: string,
 *   error: string|null,
 * }>}
 */
export async function resolveNotificationFoundationState() {
  const enabled = isNotificationsFoundationEnabled();

  if (!supabase) {
    return {
      mode: "disabled",
      enabled,
      tablesExist: false,
      probeRequired: false,
      message: "Supabase client not configured",
      suggestedFix: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
      error: null,
    };
  }

  const res = await supabase.from("notification_events").select("event_id").limit(1);

  if (!res.error) {
    if (!enabled) {
      return {
        mode: "disabled",
        enabled: false,
        tablesExist: true,
        probeRequired: false,
        message: DISABLED_MESSAGE,
        suggestedFix:
          "Set VITE_NOTIFICATIONS_FOUNDATION_ENABLED=true to run full notification RLS probes",
        error: null,
      };
    }
    return {
      mode: "ready",
      enabled: true,
      tablesExist: true,
      probeRequired: true,
      message: "Notification Foundation tables available",
      suggestedFix: "",
      error: null,
    };
  }

  const kind = classifyNotificationTableError(res.error.message);

  if (kind === "missing_table") {
    return {
      mode: "setup_pending",
      enabled,
      tablesExist: false,
      probeRequired: false,
      message: SETUP_PENDING_MESSAGE,
      suggestedFix: "Run primecare-portal/supabase/sql/notifications_foundation_migration.sql",
      error: res.error.message,
    };
  }

  if (kind === "schema_cache") {
    return {
      mode: "schema_cache",
      enabled,
      tablesExist: false,
      probeRequired: false,
      message: SCHEMA_CACHE_MESSAGE,
      suggestedFix:
        "After applying the migration, refresh Supabase API schema cache (Dashboard → Settings → API → Reload schema) or wait a few minutes for PostgREST schema cache to refresh.",
      error: res.error.message,
    };
  }

  return {
    mode: "probe_error",
    enabled,
    tablesExist: false,
    probeRequired: enabled,
    message: res.error.message || "Notification table probe failed",
    suggestedFix: enabled
      ? "Verify RLS policies and authenticated role access"
      : "Apply migration first, then enable VITE_NOTIFICATIONS_FOUNDATION_ENABLED",
    error: res.error.message,
  };
}

/**
 * @param {{ mode: NotificationFoundationMode }} state
 */
export function shouldSkipNotificationIsolationProbes(state) {
  return (
    state.mode === "disabled" ||
    state.mode === "setup_pending" ||
    state.mode === "schema_cache"
  );
}

/**
 * @param {string} [checkId]
 */
export function isNotificationFoundationSetupPendingId(checkId) {
  const id = String(checkId || "");
  return (
    id === "notifications.foundation" ||
    id.includes("setup_pending") ||
    id.startsWith("foundation.")
  );
}

/**
 * @param {import('@/validation/qaValidationCore.js').QaValidationCheck} check
 */
export function isSetupPendingQaCheck(check) {
  return check?.status === "info" || isNotificationFoundationSetupPendingId(check?.id);
}

/**
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} ctx
 * @param {Object} partial
 */
export function createNotificationFoundationPredatorEntry(ctx, partial = {}) {
  return {
    status: partial.status || "INFO",
    module: "Notifications",
    step: partial.step || "foundation.state",
    expected: partial.expected,
    actual: partial.actual,
    rootCauseGuess: partial.rootCauseGuess || partial.message || "",
    suggestedFix: partial.suggestedFix || "",
    severity: partial.severity || "low",
    issueClass: partial.issueClass || "setup_pending",
    tenantId: ctx.tenantId,
    role: ctx.role,
    userId: ctx.userId,
  };
}
