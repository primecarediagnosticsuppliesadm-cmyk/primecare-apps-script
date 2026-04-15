import { apiPost } from "@/api/primecareApi";

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