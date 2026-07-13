/**
 * Lightweight Inventory → related-module return context (session only).
 * Does not change routes or write APIs.
 */
export const INVENTORY_RETURN_CONTEXT_KEY = "primecare_inventory_return_context";

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
export function writeInventoryReturnContext(partial = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    sourceModule: "inventory",
    activeTab: str(partial.activeTab) || "stock",
    search: str(partial.search),
    tenantFilter: str(partial.tenantFilter) || "hq",
    healthFilter: str(partial.healthFilter),
    sortKey: str(partial.sortKey) || "name",
    selectedProductId: str(partial.selectedProductId),
    selectedTenantId: str(partial.selectedTenantId),
    pendingRestore: false,
    savedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(INVENTORY_RETURN_CONTEXT_KEY, JSON.stringify(payload));
}

export function peekInventoryReturnContext() {
  if (typeof window === "undefined") return null;
  const parsed = safeParse(sessionStorage.getItem(INVENTORY_RETURN_CONTEXT_KEY) || "");
  if (!parsed || str(parsed.sourceModule) !== "inventory") return null;
  return parsed;
}

export function clearInventoryReturnContext() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(INVENTORY_RETURN_CONTEXT_KEY);
}

/**
 * Arm restore so StockPage applies context once on next open (Back to Inventory).
 */
export function armInventoryReturnRestore() {
  const current = peekInventoryReturnContext();
  if (!current) return null;
  const next = { ...current, pendingRestore: true, sourceModule: "inventory" };
  sessionStorage.setItem(INVENTORY_RETURN_CONTEXT_KEY, JSON.stringify(next));
  return next;
}

/**
 * Consume only when Back-to-Inventory armed restore; ignore stale leave payloads.
 */
export function consumeInventoryReturnContextIfArmed() {
  const current = peekInventoryReturnContext();
  if (!current?.pendingRestore) return null;
  clearInventoryReturnContext();
  return current;
}

export function hasInventoryReturnContext() {
  return Boolean(peekInventoryReturnContext());
}
