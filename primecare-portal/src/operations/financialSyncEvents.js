/** Single cross-module financial refresh event (payment / allocation writes). */
export const FINANCIAL_SYNC_COMPLETED_EVENT = "primecare:FinancialSyncCompleted";

/**
 * @param {Record<string, unknown>} [detail]
 */
export function notifyFinancialSyncCompleted(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FINANCIAL_SYNC_COMPLETED_EVENT, { detail: { ...detail } })
  );
}

/**
 * @param {(detail: Record<string, unknown>) => void} handler
 */
export function onFinancialSyncCompleted(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => {
    handler(event?.detail || {});
  };
  window.addEventListener(FINANCIAL_SYNC_COMPLETED_EVENT, listener);
  return () => window.removeEventListener(FINANCIAL_SYNC_COMPLETED_EVENT, listener);
}

/** @deprecated Use notifyFinancialSyncCompleted */
export const notifyFinancialSyncRefresh = notifyFinancialSyncCompleted;

/** @deprecated Use onFinancialSyncCompleted */
export const onFinancialSyncRefresh = onFinancialSyncCompleted;
