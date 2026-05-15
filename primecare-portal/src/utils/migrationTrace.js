/**
 * PrimeCare Supabase migration tracing (console-only).
 * Use to audit which code paths still hit Apps Script vs Supabase.
 */

export function logSupabaseFeatureSource(feature, detail = {}) {
  console.log("SUPABASE FEATURE SOURCE", feature, detail);
}

export function logAppsScriptFallbackUsed(feature, reason = "") {
  console.warn("APPS_SCRIPT FALLBACK USED", feature, reason);
}

export function logPartialMigrationWarning(feature, message = "") {
  console.warn("PARTIAL MIGRATION WARNING", feature, message);
}

export function logStaleFieldMapping(feature, field, expected, actual) {
  console.warn("STALE FIELD MAPPING", {
    feature,
    field,
    expected,
    actual,
  });
}

/** Log when a page intentionally uses Apps Script as primary (not yet migrated). */
export function logAppsScriptPrimarySource(feature, action = "") {
  console.log("APPS_SCRIPT PRIMARY SOURCE", feature, action);
}
