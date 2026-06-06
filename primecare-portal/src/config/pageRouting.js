import { ROLES } from "./roles";

/**
 * Normalize legacy / alias page keys to canonical menu keys.
 * @param {string} [page]
 */
export function normalizePageKey(page) {
  switch (page) {
    case "master-catalog":
    case "masterCatalog":
      return "masterCatalog";
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
    case "founder-financial-intelligence":
    case "founderFinancialIntelligence":
    case "financial-intelligence":
      return "founderFinancialIntelligence";
    case "pilot-readiness":
    case "pilotReadiness":
      return "pilotReadiness";
    case "qa-command-center":
    case "qaCommandCenter":
      return "qaCommandCenter";
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
    case "commission-engine":
    case "commission-management":
    case "commissionEngine":
      return "commissionEngine";
    case "lab-contracts":
    case "contract-management":
    case "labContractEngine":
      return "labContractEngine";
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
