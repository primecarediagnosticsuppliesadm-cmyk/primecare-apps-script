import { ROLES } from "./roles";
import { PERMISSIONS } from "./permissions";

/** Friendly URL overrides (canonical page key -> pathname). */
const PAGE_PATH_OVERRIDES = {
  qualificationReview: "/qualification-analytics",
  risk: "/credit-risk",
};

function pageKeyToPathSegment(pageKey) {
  return String(pageKey || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/** Canonical page key -> browser pathname (no trailing slash). */
export const PAGE_PATHS = Object.fromEntries(
  Object.keys(PERMISSIONS).map((key) => [
    key,
    PAGE_PATH_OVERRIDES[key] || `/${pageKeyToPathSegment(key)}`,
  ])
);

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
    case "qualification-analytics":
    case "qualifications":
      return "qualificationReview";
    case "predator-debug":
    case "predatorDebug":
      return "predatorDebug";
    case "operations-center":
    case "operationsCenter":
      return "operationsCenter";
    case "access-audit":
    case "accessAudit":
      return "accessAudit";
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
    case "revenue-funnel":
    case "revenueFunnel":
      return "revenueFunnel";
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
    case "credit-risk":
      return "risk";
    case "payments":
    case "account":
    case "lab-account":
    case "labAccount":
      return "labAccount";
    case "lab-invoices":
    case "invoices":
      return "labInvoices";
    case "logistics-delivery":
    case "logisticsDelivery":
      return "logisticsDelivery";
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
    if (key === "invoices") return "labInvoices";
  }
  if (role === ROLES.EXECUTIVE) {
    if (key === "collections") return "risk";
    if (key === "visits") return "operationsCenter";
  }
  return key;
}

/**
 * Pathname for a canonical page key (falls back to kebab-case segment).
 * @param {string} [pageKey]
 */
export function getPagePathForKey(pageKey) {
  const canonical = normalizePageKey(pageKey);
  if (!canonical) return "/";
  return PAGE_PATHS[canonical] || `/${pageKeyToPathSegment(canonical)}`;
}

/**
 * Resolve the first URL segment to a canonical page key, or null for root/unknown.
 * @param {string} [pathname]
 */
export function resolvePageKeyFromPath(pathname) {
  const normalizedPath = String(pathname || "")
    .split("#")[0]
    .split("?")[0]
    .replace(/\/+$/, "");
  if (!normalizedPath || normalizedPath === "/") return null;

  const segment = normalizedPath.split("/").filter(Boolean)[0];
  if (!segment) return null;

  const pageKey = normalizePageKey(segment);
  if (!pageKey || !PERMISSIONS[pageKey]) return null;
  return pageKey;
}

/**
 * Pick the landing page after auth: URL path when allowed, otherwise role default.
 * @param {string} role
 * @param {string} [pathname]
 * @param {string} defaultPage
 * @param {(pageKey: string) => boolean} canAccess
 */
export function resolveInitialPageForRole(role, pathname, defaultPage, canAccess) {
  const fallback = resolvePageKeyForRole(role, defaultPage);
  const fromPath = resolvePageKeyFromPath(pathname);
  if (fromPath) {
    const resolvedFromPath = resolvePageKeyForRole(role, fromPath);
    if (canAccess(resolvedFromPath)) {
      return resolvedFromPath;
    }
  }
  return fallback;
}

/**
 * Keep the browser URL aligned with the active portal page.
 * @param {string} pageKey
 * @param {{ replace?: boolean }} [options]
 */
export function syncPagePathToUrl(pageKey, { replace = false } = {}) {
  if (typeof window === "undefined") return;

  const path = getPagePathForKey(pageKey);
  const current = window.location.pathname.replace(/\/+$/, "") || "/";
  if (current === path) return;

  const state = { primecarePage: normalizePageKey(pageKey) };
  if (replace) {
    window.history.replaceState(state, "", path);
  } else {
    window.history.pushState(state, "", path);
  }
}
