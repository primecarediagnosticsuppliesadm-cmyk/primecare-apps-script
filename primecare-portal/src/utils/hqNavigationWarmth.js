import { ROLES } from "@/config/roles.js";
import {
  peekAdminDashboardReadCache,
  peekAgentWorkspaceReadCache,
  peekCollectionsReadCache,
  peekLabsCreditReadCache,
  peekOrdersReadCache,
  peekQualificationReviewReadCache,
  peekStockDashboardReadCache,
} from "@/api/primecareSupabaseApi.js";
import { peekOperationsCommandCenterCache } from "@/operations/operationsCommandCenterLoader.js";
import { hasPageUiCache } from "@/utils/hqPageUiCache.js";

function warmApiPeek(fn) {
  try {
    return Boolean(fn());
  } catch {
    return false;
  }
}

/**
 * True when revisiting this page can render from API or page UI cache without blocking.
 * @param {string} pageKey
 * @param {string} role
 * @param {{ id?: string, tenantId?: string, tenant_id?: string }|null} currentUser
 */
export function isNavigationPageCacheWarm(pageKey, role, currentUser) {
  const key = String(pageKey || "");
  const normalizedRole = String(role || "").toLowerCase();
  const userId = String(currentUser?.id || "");

  if (hasPageUiCache(`${normalizedRole}:${key}`)) return true;

  switch (key) {
    case "dashboard":
      if (normalizedRole === ROLES.EXECUTIVE) {
        return warmApiPeek(() => peekOperationsCommandCenterCache(currentUser));
      }
      if (normalizedRole === ROLES.ADMIN) {
        return warmApiPeek(() => peekAdminDashboardReadCache());
      }
      if (normalizedRole === ROLES.AGENT) {
        return warmApiPeek(() => peekAgentWorkspaceReadCache(userId));
      }
      return false;
    case "orders":
      return warmApiPeek(() => peekOrdersReadCache());
    case "collections":
    case "risk":
      return warmApiPeek(() => peekCollectionsReadCache());
    case "inventory":
    case "stock":
      return warmApiPeek(() => peekStockDashboardReadCache());
    case "qualificationReview":
    case "qualification-review":
      return warmApiPeek(() => peekQualificationReviewReadCache());
    case "labs":
      return warmApiPeek(() => peekLabsCreditReadCache());
    case "visits":
      if (normalizedRole === ROLES.AGENT) {
        return warmApiPeek(() => peekAgentWorkspaceReadCache(userId));
      }
      return false;
    default:
      return false;
  }
}
