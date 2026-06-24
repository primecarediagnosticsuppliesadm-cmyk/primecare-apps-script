/**
 * Gate HQ hot-path debug logs — off in production unless explicitly enabled.
 */
export function isHqDebugLogEnabled() {
  if (import.meta.env.DEV) return true;
  return String(import.meta.env.VITE_HQ_DEBUG_LOG || "").trim().toLowerCase() === "true";
}

export function hqDebugLog(...args) {
  if (!isHqDebugLogEnabled()) return;
  console.log(...args);
}

export function hqDebugWarn(...args) {
  if (!isHqDebugLogEnabled()) return;
  console.warn(...args);
}
