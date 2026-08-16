import { ALLOW_LEGACY_APPS_SCRIPT } from "@/config/environment.js";
import { apiPost } from "@/api/primecareApi";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";

/**
 * Client error sink. Production is Supabase-first; Apps Script logging is disabled.
 * Never call /api/primecare when legacy Apps Script is off (avoids a 500).
 */
export async function logClientError({
  authToken = "",
  page = "",
  component = "",
  actionType = "UI_ERROR",
  errorCode = "CLIENT_ERROR",
  errorMessage = "",
  stackTrace = "",
  payload = {},
}) {
  try {
    predatorStore.recordError(
      createPredatorEntry({
        status: "FAIL",
        module: page || "Client",
        step: actionType || "client_error",
        expected: "operation succeeds",
        actual: errorMessage || errorCode,
        rootCauseGuess: errorCode || "CLIENT_ERROR",
        suggestedFix: component ? `Inspect ${component}` : "Inspect client error payload",
        severity: "high",
        issueClass: "client_error",
      })
    );

    if (!ALLOW_LEGACY_APPS_SCRIPT) {
      if (import.meta.env.DEV) {
        console.error("[logClientError]", errorCode, errorMessage);
      }
      return {
        success: true,
        skipped: true,
        reason: "legacy_apps_script_disabled",
      };
    }

    const browserInfo =
      typeof navigator !== "undefined" ? navigator.userAgent : "unknown-browser";

    return await apiPost("logClientError", {
      sessionToken: authToken || "",
      page,
      component,
      actionType,
      errorCode,
      errorMessage,
      stackTrace,
      payload,
      browserInfo,
    });
  } catch (err) {
    console.error("Failed to log client error", err);
    return {
      success: false,
      error: err?.message || "CLIENT_LOGGING_FAILED",
    };
  }
}
