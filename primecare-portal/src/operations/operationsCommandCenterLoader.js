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
import { loadInventoryEconomicsBundle } from "@/inventory/inventoryEconomicsData.js";
import { loadLabOwnershipMetricsBundle } from "@/operations/operationsCenterAdminData.js";
import { HQ_COLLECTIONS_AR_LIMIT, HQ_ORDERS_LIST_DEFAULT_LIMIT } from "@/api/hqReadBounds.js";

const OPS_CACHE_MS = 45_000;
/** @type {Map<string, { at: number, data: object }>} */
const opsPayloadCache = new Map();

export function invalidateOperationsCommandCenterCache(tenantId) {
  if (!tenantId) {
    opsPayloadCache.clear();
    return;
  }
  const prefix = `${tenantId}:`;
  for (const key of opsPayloadCache.keys()) {
    if (key.startsWith(prefix)) opsPayloadCache.delete(key);
  }
}

const EMPTY_PAYLOAD = {
  dashboard: null,
  collections: [],
  inventory: [],
  orders: [],
  ordersReadOk: true,
  ordersReadError: null,
  reorderCandidates: [],
  purchaseOrders: [],
  notifications: [],
  visits: [],
  qualifications: [],
  evidence: [],
  ownershipMetrics: null,
  ownershipAgents: [],
  ownershipDirectoryUsers: [],
};

/**
 * Single parallel load for Operations Command Center (reuses existing read APIs).
 * @param {object|null} currentUser
 */
export async function loadOperationsCommandCenterData(currentUser, options = {}) {
  const { force = false } = options;
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? null;
  const userId = currentUser?.id ?? "anon";
  const cacheKey = `${tenantId || "none"}:${userId}`;
  const cached = opsPayloadCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < OPS_CACHE_MS) {
    return cached.data;
  }

  const [
    dashRes,
    collRes,
    stockRes,
    ordersRes,
    reorderRes,
    notifyRes,
    poRes,
    qualRes,
    evidenceRows,
    inventoryEconomicsRes,
    ownershipBundle,
  ] = await Promise.all([
    getAdminDashboardRead(),
    getCollectionsRead({ limit: HQ_COLLECTIONS_AR_LIMIT }),
    getStockDashboard(),
    getOrdersRead({ limit: HQ_ORDERS_LIST_DEFAULT_LIMIT }),
    getReorderForecastRead().catch(() => ({ data: { forecast: [] } })),
    getNotificationEventsRead({ tenantId, limit: 60 }),
    getPurchaseOrdersRead(),
    getQualificationReviewRead().catch(() => ({ data: [] })),
    tenantId && currentUser
      ? listOperationalEvidence(tenantId, currentUser, { limit: 100 }).catch(() => [])
      : Promise.resolve([]),
    loadInventoryEconomicsBundle(),
    tenantId ? loadLabOwnershipMetricsBundle(tenantId).catch(() => null) : Promise.resolve(null),
  ]);

  const dashboard = normalizeAdminDashboardReadResult(dashRes);
  const collections = Array.isArray(collRes?.data?.collections)
    ? collRes.data.collections
    : [];
  const inventory = Array.isArray(stockRes?.data?.inventory) ? stockRes.data.inventory : [];
  const ordersReadOk = ordersRes?.success !== false;
  const ordersReadError = ordersRes?.error || null;
  const orders = ordersReadOk && Array.isArray(ordersRes?.data?.orders) ? ordersRes.data.orders : [];
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

  const data = {
    ...EMPTY_PAYLOAD,
    dashboard,
    collections,
    inventory,
    orders,
    ordersReadOk,
    ordersReadError,
    reorderCandidates,
    purchaseOrders,
    notifications,
    visits,
    qualifications,
    evidence,
    inventoryEconomics: inventoryEconomicsRes?.model || null,
    inventoryEconomicsLoadOk: inventoryEconomicsRes?.ok === true,
    ownershipMetrics: ownershipBundle?.ownershipMetrics || null,
    ownershipAgents: ownershipBundle?.agents || [],
    ownershipDirectoryUsers: ownershipBundle?.directoryUsers || [],
  };
  opsPayloadCache.set(cacheKey, { at: Date.now(), data });
  return data;
}