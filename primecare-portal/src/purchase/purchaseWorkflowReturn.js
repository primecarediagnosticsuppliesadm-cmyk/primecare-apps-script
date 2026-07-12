/**
 * Lightweight Purchase → related-module return context (session only).
 * Does not change routes or write APIs.
 */
export const PURCHASE_RETURN_CONTEXT_KEY = "primecare_purchase_return_context";

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
export function writePurchaseReturnContext(partial = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    sourceModule: "purchase",
    activeTab: str(partial.activeTab) || "triggers",
    poSearch: str(partial.poSearch),
    poStatusFilter: str(partial.poStatusFilter),
    poSortKey: str(partial.poSortKey) || "date",
    selectedPoId: str(partial.selectedPoId),
    pendingRestore: false,
    savedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(PURCHASE_RETURN_CONTEXT_KEY, JSON.stringify(payload));
}

export function peekPurchaseReturnContext() {
  if (typeof window === "undefined") return null;
  const parsed = safeParse(sessionStorage.getItem(PURCHASE_RETURN_CONTEXT_KEY) || "");
  if (!parsed || str(parsed.sourceModule) !== "purchase") return null;
  return parsed;
}

export function clearPurchaseReturnContext() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PURCHASE_RETURN_CONTEXT_KEY);
}

/**
 * Arm restore so PurchaseOrdersPage applies context once on next open (Back to Purchase).
 */
export function armPurchaseReturnRestore() {
  const current = peekPurchaseReturnContext();
  if (!current) return null;
  const next = { ...current, pendingRestore: true, sourceModule: "purchase" };
  sessionStorage.setItem(PURCHASE_RETURN_CONTEXT_KEY, JSON.stringify(next));
  return next;
}

/**
 * Consume only when Back-to-Purchase armed restore; ignore stale leave payloads.
 */
export function consumePurchaseReturnContextIfArmed() {
  const current = peekPurchaseReturnContext();
  if (!current?.pendingRestore) return null;
  clearPurchaseReturnContext();
  return current;
}

export function hasPurchaseReturnContext() {
  return Boolean(peekPurchaseReturnContext());
}
