/**
 * PrimeCare Supabase migration tracing (console-only).
 * Use to audit which code paths still hit Apps Script vs Supabase.
 */
import {
  logAppsScriptFallbackUsed as logStructuredAppsScriptFallbackUsed,
  logHybridSourceWarning,
  logStaleFieldMigration,
} from "./migrationObservability.js";

export { logHybridSourceWarning, logStaleFieldMigration };

export function logSupabaseFeatureSource(feature, detail = {}) {
  if (!import.meta.env.DEV) return;
  console.info("SUPABASE FEATURE SOURCE", feature, detail);
}

export function logAppsScriptFallbackUsed(feature, reason = "") {
  logStructuredAppsScriptFallbackUsed(feature, reason);
}

export function logPartialMigrationWarning(feature, message = "") {
  console.warn("PARTIAL MIGRATION WARNING", feature, message);
}

export function logStaleFieldMapping(feature, field, expected, actual) {
  logStaleFieldMigration(feature, {
    feature,
    field,
    primarySourceExpected: expected,
    fallbackSourceUsed: actual,
    riskLevel: "WARNING",
  });
}

/** Log when a page intentionally uses Apps Script as primary (not yet migrated). */
export function logAppsScriptPrimarySource(feature, action = "") {
  console.log("APPS_SCRIPT PRIMARY SOURCE", feature, action);
}
