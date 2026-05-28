import {
  getAdminDashboardRead,
  getCollectionsRead,
  getOrdersRead,
  getPurchaseOrdersRead,
  getQualificationReviewRead,
  getReorderForecastRead,
  getStockDashboard,
  normalizeAdminDashboardReadResult,
} from "@/api/primecareSupabaseApi.js";
import { getNotificationEventsRead } from "@/api/notificationApi.js";
import { listOperationalEvidence } from "@/api/operationalEvidenceApi.js";

const EMPTY_PAYLOAD = {
  dashboard: null,
  collections: [],
  inventory: [],
  orders: [],
  reorderCandidates: [],
  purchaseOrders: [],
  notifications: [],
  visits: [],
  qualifications: [],
  evidence: [],
};

/**
 * Single parallel load for Operations Command Center (reuses existing read APIs).
 * @param {object|null} currentUser
 */
export async function loadOperationsCommandCenterData(currentUser) {
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? null;

  const [dashRes, collRes, stockRes, ordersRes, reorderRes, notifyRes, poRes, qualRes, evidenceRows] =
    await Promise.all([
      getAdminDashboardRead(),
      getCollectionsRead(),
      getStockDashboard(),
      getOrdersRead(),
      getReorderForecastRead().catch(() => ({ data: { forecast: [] } })),
      getNotificationEventsRead({ tenantId, limit: 60 }),
      getPurchaseOrdersRead(),
      getQualificationReviewRead().catch(() => ({ data: [] })),
      tenantId && currentUser
        ? listOperationalEvidence(tenantId, currentUser, { limit: 100 }).catch(() => [])
        : Promise.resolve([]),
    ]);

  const dashboard = normalizeAdminDashboardReadResult(dashRes);
  const collections = Array.isArray(collRes?.data?.collections)
    ? collRes.data.collections
    : [];
  const inventory = Array.isArray(stockRes?.data?.inventory) ? stockRes.data.inventory : [];
  const orders = Array.isArray(ordersRes?.data?.orders) ? ordersRes.data.orders : [];
  const reorderCandidates = Array.isArray(reorderRes?.data?.forecast)
    ? reorderRes.data.forecast
    : [];
  const purchaseOrders = Array.isArray(poRes?.data?.purchaseOrders)
    ? poRes.data.purchaseOrders
    : Array.isArray(poRes?.data?.orders)
      ? poRes.data.orders
      : [];
  const notifications = Array.isArray(notifyRes?.data) ? notifyRes.data : [];
  const visits = Array.isArray(dashboard?.visits?.visits)
    ? dashboard.visits.visits
    : [];
  const qualifications = Array.isArray(qualRes?.data) ? qualRes.data : [];
  const evidence = Array.isArray(evidenceRows) ? evidenceRows : [];

  return {
    ...EMPTY_PAYLOAD,
    dashboard,
    collections,
    inventory,
    orders,
    reorderCandidates,
    purchaseOrders,
    notifications,
    visits,
    qualifications,
    evidence,
  };
}