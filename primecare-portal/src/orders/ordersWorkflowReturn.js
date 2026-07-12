/**
 * Lightweight Orders → related-module return context (session only).
 * Does not change routes or write APIs.
 */
export const ORDERS_RETURN_CONTEXT_KEY = "primecare_orders_return_context";

function str(value) {
  return String(value ?? "").trim();
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} partial
 */
export function writeOrdersReturnContext(partial = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    sourceModule: "orders",
    orderId: str(partial.orderId),
    labId: str(partial.labId),
    activeQueueKey: str(partial.activeQueueKey),
    search: str(partial.search),
    status: str(partial.status) || "ALL",
    paymentStatus: str(partial.paymentStatus) || "ALL",
    labFilter: str(partial.labFilter) || "ALL",
    dateFrom: str(partial.dateFrom),
    dateTo: str(partial.dateTo),
    sortKey: str(partial.sortKey),
    pendingRestore: false,
    savedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(ORDERS_RETURN_CONTEXT_KEY, JSON.stringify(payload));
}

export function peekOrdersReturnContext() {
  if (typeof window === "undefined") return null;
  const parsed = safeParse(sessionStorage.getItem(ORDERS_RETURN_CONTEXT_KEY) || "");
  if (!parsed || str(parsed.sourceModule) !== "orders") return null;
  return parsed;
}

export function clearOrdersReturnContext() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ORDERS_RETURN_CONTEXT_KEY);
}

/**
 * Arm restore so OrdersPage applies context once on next open (Back to Orders).
 */
export function armOrdersReturnRestore() {
  const current = peekOrdersReturnContext();
  if (!current) return null;
  const next = { ...current, pendingRestore: true, sourceModule: "orders" };
  sessionStorage.setItem(ORDERS_RETURN_CONTEXT_KEY, JSON.stringify(next));
  return next;
}

/**
 * Consume only when Back-to-Orders armed restore; ignore stale leave payloads.
 */
export function consumeOrdersReturnContextIfArmed() {
  const current = peekOrdersReturnContext();
  if (!current?.pendingRestore) return null;
  clearOrdersReturnContext();
  return current;
}

export function hasOrdersReturnContext() {
  return Boolean(peekOrdersReturnContext());
}
