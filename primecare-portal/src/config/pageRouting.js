import { ROLES } from "./roles";

/**
 * Normalize legacy / alias page keys to canonical menu keys.
 * @param {string} [page]
 */
export function normalizePageKey(page) {
  switch (page) {
    case "stock":
    case "inventory-ledger":
    case "inventory-movements":
      return "inventory";
    case "purchase-orders":
    case "procurement":
    case "suppliers":
      return "purchase";
    case "reorder-forecast":
      return "reorder";
    case "ai-insights":
      return "insights";
    case "qualification-review":
    case "qualifications":
      return "qualificationReview";
    case "predator-debug":
    case "predatorDebug":
      return "predatorDebug";
    case "operations-center":
    case "operationsCenter":
      return "operationsCenter";
    case "founder-navigation":
    case "founderNavigation":
    case "founder-journey":
      return "founderNavigation";
    case "founder-strategy":
    case "founderStrategy":
      return "founderStrategy";
    case "tenant-management":
    case "tenantManagement":
      return "tenantManagement";
    case "distributor-management":
    case "distributorManagement":
      return "distributorManagement";
    case "distributor-provisioning":
    case "provisioning":
    case "distributorProvisioning":
      return "distributorProvisioning";
    case "lab-orders":
    case "lab-ordering":
    case "ordering":
      return "labOrders";
    case "payments":
    case "account":
    case "lab-account":
    case "labAccount":
      return "labAccount";
    default:
      return page;
  }
}

/**
 * Map role-specific aliases (e.g. lab user bookmarking /collections).
 * @param {string} role
 * @param {string} [page]
 */
export function resolvePageKeyForRole(role, page) {
  const key = normalizePageKey(page);
  if (role === ROLES.LAB) {
    if (key === "collections") return "labAccount";
    if (key === "orders") return "labOrders";
  }
  return key;
}
