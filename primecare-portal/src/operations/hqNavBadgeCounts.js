import { getSidebarSummary, invalidateSidebarSummaryCache } from "@/api/sidebarSummaryApi.js";

export { invalidateSidebarSummaryCache };

/**
 * HQ nav badge counts — delegates to unified getSidebarSummary (single parallel batch).
 * @param {{ tenantId?: string, role?: string, force?: boolean }} options
 */
export async function loadHqNavBadgeCounts(options = {}) {
  const summary = await getSidebarSummary(options);
  return summary.navBadges || {};
}
