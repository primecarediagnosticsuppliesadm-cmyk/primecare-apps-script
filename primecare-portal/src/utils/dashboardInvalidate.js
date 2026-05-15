/** Used to refresh merged Admin Dashboard when orders / AR change elsewhere (e.g. Orders Monitor). */
export const ADMIN_DASHBOARD_INVALIDATE_EVENT = "primecare_admin_dashboard_invalidate";

export function invalidateAdminDashboardCaches() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_DASHBOARD_INVALIDATE_EVENT));
  }
}
