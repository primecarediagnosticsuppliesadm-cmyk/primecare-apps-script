import {
  getAdminDashboardRead,
  getCollectionsRead,
  getOrdersRead,
  normalizeAdminDashboardReadResult,
} from "@/api/primecareSupabaseApi.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import { mapProvisioningEventRow } from "@/operations/userProvisioningEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

/** Parallel load for HQ dashboard priorities — reuses existing read APIs only. */
export async function loadHqPrioritiesBundle(tenantId) {
  const tid = str(tenantId);
  if (!tid) {
    return {
      ok: false,
      error: "Tenant context missing",
      dashboard: null,
      collections: [],
      orders: [],
      directoryUsers: [],
      auditEvents: [],
    };
  }

  const [dashRes, collRes, ordersRes, opsBundle, auditRes] = await Promise.all([
    getAdminDashboardRead(),
    getCollectionsRead(),
    getOrdersRead(),
    loadOperationsCenterAdminBundle(tid),
    getUserProvisioningEventsRead({ tenantId: tid, limit: 100 }),
  ]);

  const dashboard = normalizeAdminDashboardReadResult(dashRes);
  const collections = Array.isArray(collRes?.data?.collections) ? collRes.data.collections : [];
  const orders =
    ordersRes?.success !== false && Array.isArray(ordersRes?.data?.orders)
      ? ordersRes.data.orders
      : [];

  const userNameById = new Map(
    (opsBundle.directoryUsers || []).map((u) => [str(u.userId), str(u.name)])
  );
  const auditEvents = (auditRes?.data?.events || []).map((row) =>
    mapProvisioningEventRow(row, userNameById)
  );

  return {
    ok: dashRes?.success !== false || collRes?.success !== false,
    error: dashRes?.error || collRes?.error || opsBundle?.error || null,
    dashboard,
    collections,
    orders,
    directoryUsers: opsBundle.directoryUsers || [],
    auditEvents,
  };
}
