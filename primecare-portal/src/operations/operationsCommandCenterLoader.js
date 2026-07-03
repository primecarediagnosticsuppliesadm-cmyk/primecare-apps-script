import {
  getAdminDashboardRead,
  getCollectionsRead,
  getOrdersRead,
  getPurchaseOrdersRead,
  getQualificationReviewRead,
  getReorderForecastRead,
  getStockDashboard,
  normalizeAdminDashboardReadResult,
  peekAdminDashboardReadCache,
  peekCollectionsReadCache,
  peekOrdersReadCache,
  peekStockDashboardReadCache,
} from "@/api/primecareSupabaseApi.js";
import { coordinatedRead } from "@/api/hqReadCoordinator.js";
import { mergeReadHealth } from "@/observability/readHealth.js";
import { getFounderSnapshotRead } from "@/api/founderSnapshotApi.js";
import { getNotificationEventsRead } from "@/api/notificationApi.js";
import { listOperationalEvidence } from "@/api/operationalEvidenceApi.js";
import { loadInventoryEconomicsBundle } from "@/inventory/inventoryEconomicsData.js";
import { loadLabOwnershipMetricsBundle } from "@/operations/operationsCenterAdminData.js";
import { HQ_COLLECTIONS_AR_LIMIT, HQ_ORDERS_LIST_DEFAULT_LIMIT } from "@/api/hqReadBounds.js";

function str(v) {
  return String(v ?? "").trim();
}

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

export function peekOperationsCommandCenterCache(currentUser) {
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? null;
  const userId = currentUser?.id ?? "anon";
  const cacheKey = `${tenantId || "none"}:${userId}`;
  const cached = opsPayloadCache.get(cacheKey);
  if (cached && Date.now() - cached.at < OPS_CACHE_MS) {
    return cached.data;
  }
  return null;
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
  founderSnapshot: null,
};

async function resolveDashboardReadForOps(force = false, tenantId = "") {
  const tid = str(tenantId);
  if (!force) {
    const peeked = peekAdminDashboardReadCache();
    if (peeked?.data) {
      return { success: true, data: peeked.data, fromCache: true };
    }
  }
  return getAdminDashboardRead({ force, ...(tid ? { tenantId: tid } : {}) });
}

/**
 * Core ops reads — snapshot, attention queue, and health tiles.
 * @param {object|null} currentUser
 * @param {{ force?: boolean }} [options]
 */
export async function loadOperationsCommandCenterCore(currentUser, options = {}) {
  const { force = false } = options;
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? null;
  const tid = str(tenantId);
  const readOpts = force ? { force: true, ...(tid ? { tenantId: tid } : {}) } : tid ? { tenantId: tid } : {};

  const collCached = !force ? peekCollectionsReadCache(readOpts) : null;
  const stockCached = !force ? peekStockDashboardReadCache() : null;
  const ordersCached = !force ? peekOrdersReadCache(readOpts) : null;

  const [dashRes, collRes, stockRes, ordersRes, notifyRes] = await Promise.all([
    resolveDashboardReadForOps(force, tid),
    collCached ? Promise.resolve(collCached) : getCollectionsRead(readOpts),
    stockCached ? Promise.resolve(stockCached) : getStockDashboard(readOpts),
    ordersCached ? Promise.resolve(ordersCached) : getOrdersRead({ force, ...readOpts, skipLineCounts: true }),
    getNotificationEventsRead({ tenantId, limit: 60 }),
  ]);

  const dashboard = normalizeAdminDashboardReadResult(dashRes);
  const collections = Array.isArray(collRes?.data?.collections) ? collRes.data.collections : [];
  const inventory = Array.isArray(stockRes?.data?.inventory) ? stockRes.data.inventory : [];
  const ordersReadOk = ordersRes?.success !== false;
  const ordersReadError = ordersRes?.error || null;
  const orders =
    ordersReadOk && Array.isArray(ordersRes?.data?.orders) ? ordersRes.data.orders : [];
  const notifications = Array.isArray(notifyRes?.data) ? notifyRes.data : [];
  const visits = Array.isArray(dashboard?.visits?.visits) ? dashboard.visits.visits : [];

  return {
    ...EMPTY_PAYLOAD,
    dashboard,
    collections,
    inventory,
    orders,
    ordersReadOk,
    ordersReadError,
    notifications,
    visits,
    _dashReadResult: dashRes,
  };
}

/**
 * Secondary ops panels — loaded after core snapshot paints.
 * @param {object|null} currentUser
 * @param {{ force?: boolean }} [options]
 */
export async function loadOperationsCommandCenterExtended(currentUser, options = {}) {
  const { force = false } = options;
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? null;
  const readOpts = force ? { force: true } : {};

  const [reorderRes, poRes, qualRes, evidenceRows, inventoryEconomicsRes, ownershipBundle, founderSnapRes] =
    await Promise.all([
      getReorderForecastRead(readOpts).catch(() => ({ data: { forecast: [] } })),
      getPurchaseOrdersRead(readOpts),
      getQualificationReviewRead(readOpts).catch(() => ({ data: [] })),
      tenantId && currentUser
        ? listOperationalEvidence(tenantId, currentUser, { limit: 100 }).catch(() => [])
        : Promise.resolve([]),
      loadInventoryEconomicsBundle(),
      tenantId ? loadLabOwnershipMetricsBundle(tenantId).catch(() => null) : Promise.resolve(null),
      tenantId
        ? getFounderSnapshotRead({ tenantId }).catch(() => ({ success: false, data: null }))
        : Promise.resolve({ success: false, data: null }),
    ]);

  return {
    reorderCandidates: Array.isArray(reorderRes?.data?.forecast) ? reorderRes.data.forecast : [],
    purchaseOrders: Array.isArray(poRes?.data?.purchaseOrders)
      ? poRes.data.purchaseOrders
      : Array.isArray(poRes?.data?.orders)
        ? poRes.data.orders
        : [],
    qualifications: Array.isArray(qualRes?.data) ? qualRes.data : [],
    evidence: Array.isArray(evidenceRows) ? evidenceRows : [],
    inventoryEconomics: inventoryEconomicsRes?.model || null,
    inventoryEconomicsLoadOk: inventoryEconomicsRes?.ok === true,
    ownershipMetrics: ownershipBundle?.ownershipMetrics || null,
    ownershipAgents: ownershipBundle?.agents || [],
    ownershipDirectoryUsers: ownershipBundle?.directoryUsers || [],
    founderSnapshot: founderSnapRes?.success ? founderSnapRes.data : null,
    _founderReadResult: founderSnapRes,
  };
}

/**
 * Single parallel load for Operations Command Center (reuses existing read APIs).
 * @param {object|null} currentUser
 * @param {{ force?: boolean, progressive?: boolean, onCoreReady?: (payload: object) => void }} [options]
 */
export async function loadOperationsCommandCenterData(currentUser, options = {}) {
  const { force = false, progressive = false, onCoreReady } = options;
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? null;
  const userId = currentUser?.id ?? "anon";
  const cacheKey = `${tenantId || "none"}:${userId}`;

  if (!force && !progressive) {
    const cached = opsPayloadCache.get(cacheKey);
    if (cached && Date.now() - cached.at < OPS_CACHE_MS) {
      return cached.data;
    }
  }

  const coordKey = `${cacheKey}:ops:${force ? "force" : "normal"}`;

  return coordinatedRead(coordKey, async () => {
    if (progressive && typeof onCoreReady === "function") {
      const core = await loadOperationsCommandCenterCore(currentUser, { force });
      onCoreReady({ ...core, _extendedPending: true, readHealth: mergeReadHealth(core._dashReadResult) });
      const extended = await loadOperationsCommandCenterExtended(currentUser, { force });
      const data = {
        ...core,
        ...extended,
        _extendedPending: false,
        readHealth: mergeReadHealth(core._dashReadResult, extended._founderReadResult),
      };
      delete data._dashReadResult;
      delete data._founderReadResult;
      if (!force) {
        opsPayloadCache.set(cacheKey, { at: Date.now(), data });
      }
      return data;
    }

    const [core, extended] = await Promise.all([
      loadOperationsCommandCenterCore(currentUser, { force }),
      loadOperationsCommandCenterExtended(currentUser, { force }),
    ]);
    const data = {
      ...core,
      ...extended,
      _extendedPending: false,
      readHealth: mergeReadHealth(core._dashReadResult, extended._founderReadResult),
    };
    delete data._dashReadResult;
    delete data._founderReadResult;

    if (!force) {
      opsPayloadCache.set(cacheKey, { at: Date.now(), data });
    }
    return data;
  });
}
