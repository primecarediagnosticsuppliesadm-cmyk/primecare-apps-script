import { invalidateAdminDashboardReadCache } from "@/api/primecareSupabaseApi.js";
import { invalidateHqTodaysWorkCache } from "@/operations/hqCommandCenterData.js";

/** Used to refresh merged Admin Dashboard when orders / AR change elsewhere (e.g. Orders Monitor). */
export const ADMIN_DASHBOARD_INVALIDATE_EVENT = "primecare_admin_dashboard_invalidate";

export function invalidateAdminDashboardCaches() {
  invalidateAdminDashboardReadCache();
  invalidateHqTodaysWorkCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_DASHBOARD_INVALIDATE_EVENT));
  }
}
