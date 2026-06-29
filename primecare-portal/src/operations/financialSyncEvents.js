/**
 * Cross-module cache refresh after payment / allocation writes.
 * @param {Record<string, unknown>} [detail]
 */
export function notifyFinancialSyncRefresh(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("primecare:financialSyncRefresh", { detail: { ...detail } })
  );
}

/**
 * @param {(detail: Record<string, unknown>) => void} handler
 */
export function onFinancialSyncRefresh(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => {
    handler(event?.detail || {});
  };
  window.addEventListener("primecare:financialSyncRefresh", listener);
  return () => window.removeEventListener("primecare:financialSyncRefresh", listener);
}
