import { hqDebugWarn } from "@/utils/hqDebugLog.js";

/**
 * Log AR / invoice allocation divergence for ops reconciliation.
 * @param {Record<string, unknown>} context
 */
export function logFinancialDriftDetected(context = {}) {
  const payload = {
    event: "financial_drift_detected",
    at: new Date().toISOString(),
    ...context,
  };
  hqDebugWarn("[financial_drift_detected]", payload);
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[financial_drift_detected]", payload);
  }
  return payload;
}
