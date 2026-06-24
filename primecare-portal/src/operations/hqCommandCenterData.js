import {
  getCollectionsRead,
  getOperationsPlatformUsersRead,
  mapOrderRow,
} from "@/api/primecareSupabaseApi.js";
import {
  HQ_DASHBOARD_RECENT_DAYS,
  HQ_ORDER_LIST_COLUMNS,
  HQ_ORDERS_LIST_DEFAULT_LIMIT,
  recentDateYmd,
} from "@/api/hqReadBounds.js";
import { fetchInventoryBoundedRows } from "@/api/hqBoundedReads.js";
import { supabase } from "@/api/supabaseClient.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import {
  productsNearStockoutFromInventoryStats,
  rollupInventoryTableRows,
} from "@/metrics/computeInventoryMetrics.js";
import { mapPlatformUserRow } from "@/operations/operationsCenterAdminEngine.js";
import {
  enrichDirectoryUsers,
  mapProvisioningEventRow,
} from "@/operations/userProvisioningEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

const TODAYS_WORK_CACHE_MS = 45_000;

/** @type {{ key: string, loadedAt: number, data: object|null }} */
let todaysWorkCache = { key: "", loadedAt: 0, data: null };
/** @type {Promise<object>|null} */
let todaysWorkInFlight = null;

export const TODAYS_WORK_CARD_IDS = ["inventory", "collections", "orders", "users", "audit"];

const EMPTY_BUNDLE = {
  ok: false,
  error: "Tenant context missing",
  dashboard: null,
  collections: [],
  orders: [],
  directoryUsers: [],
  auditEvents: [],
};

export function invalidateHqTodaysWorkCache() {
  todaysWorkCache = { key: "", loadedAt: 0, data: null };
  todaysWorkInFlight = null;
}

/** Cache metadata for freshness labels. */
export function getHqTodaysWorkCacheMeta(tenantId) {
  const cacheKey = str(tenantId) || "none";
  if (todaysWorkCache.data && todaysWorkCache.key === cacheKey) {
    return { loadedAt: todaysWorkCache.loadedAt };
  }
  return null;
}

/** Read cached bundle without fetching (warm navigation). */
export function peekHqTodaysWorkBundle(tenantId) {
  const cacheKey = str(tenantId) || "none";
  if (
    todaysWorkCache.data &&
    todaysWorkCache.key === cacheKey &&
    Date.now() - todaysWorkCache.loadedAt < TODAYS_WORK_CACHE_MS
  ) {
    return todaysWorkCache.data;
  }
  return null;
}

/** Persist a merged bundle after progressive card loads (warm navigation). */
export function storeHqTodaysWorkBundle(tenantId, bundle) {
  const cacheKey = str(tenantId) || "none";
  if (!cacheKey || cacheKey === "none" || !bundle) return;
  todaysWorkCache = { key: cacheKey, loadedAt: Date.now(), data: bundle };
}

function mapDirectoryUsers(usersRes) {
  return enrichDirectoryUsers((usersRes?.data?.users || []).map(mapPlatformUserRow), {
    distributorNameById: new Map(),
    labAssignments: [],
    distributorAssignments: [],
  });
}

function mapAuditEvents(auditRes, directoryUsers = []) {
  const userNameById = new Map(directoryUsers.map((u) => [str(u.userId), str(u.name)]));
  return (auditRes?.data?.events || []).map((row) => mapProvisioningEventRow(row, userNameById));
}

/** Inventory-only read — same criticalItems rule as getAdminDashboardRead (rollupInventoryTableRows). */
async function loadTodaysWorkInventorySlice() {
  const { data, error } = await fetchInventoryBoundedRows(supabase);
  const stockStats = rollupInventoryTableRows(data || []);
  return {
    slice: {
      dashboard: {
        summary: { stockStats },
        executive: { productsNearStockout: productsNearStockoutFromInventoryStats(stockStats) },
      },
    },
    error: error?.message || null,
  };
}

/** Orders list for pending count — same bounded query as getOrdersRead without line-count fan-out. */
async function loadTodaysWorkOrdersSlice() {
  if (!supabase) {
    return { slice: { orders: [] }, error: "Supabase is not configured" };
  }

  const limit = HQ_ORDERS_LIST_DEFAULT_LIMIT;
  const recentFrom = recentDateYmd(HQ_DASHBOARD_RECENT_DAYS);
  let rawList = [];
  let lastError = null;

  const primary = await supabase
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .gte("order_date", recentFrom)
    .order("order_date", { ascending: false })
    .limit(limit);

  if (!primary.error) {
    rawList = Array.isArray(primary.data) ? primary.data : [];
  } else {
    lastError = primary.error;
    const fallback = await supabase
      .from("orders")
      .select(HQ_ORDER_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!fallback.error) {
      rawList = Array.isArray(fallback.data) ? fallback.data : [];
      lastError = null;
    } else {
      lastError = fallback.error;
    }
  }

  const orders = rawList.map((row, idx) => mapOrderRow(row, "", idx));
  return {
    slice: { orders },
    error: lastError?.message || null,
  };
}

/**
 * Lightweight Today's Work bundle — no full Operations Center admin load.
 * Reuses cached dashboard / collections / orders reads when available.
 * @param {string} tenantId
 * @param {{ force?: boolean }} [options]
 */
export async function loadHqTodaysWorkBundle(tenantId, options = {}) {
  const tid = str(tenantId);
  const force = options.force === true;
  const cacheKey = tid || "none";

  if (!tid) {
    return { ...EMPTY_BUNDLE };
  }

  if (
    !force &&
    todaysWorkCache.data &&
    todaysWorkCache.key === cacheKey &&
    Date.now() - todaysWorkCache.loadedAt < TODAYS_WORK_CACHE_MS
  ) {
    return todaysWorkCache.data;
  }

  if (!force && todaysWorkInFlight) {
    return todaysWorkInFlight;
  }

  const run = async () => {
    const loaders = createTodaysWorkCardLoaders(tid, { force });
    const results = await Promise.all(TODAYS_WORK_CARD_IDS.map((id) => loaders[id]()));
    const merged = {
      ok: true,
      error: null,
      dashboard: null,
      collections: [],
      orders: [],
      directoryUsers: [],
      auditEvents: [],
    };
    for (const result of results) {
      if (result.error) merged.error = merged.error || result.error;
      Object.assign(merged, result.slice);
    }
    merged.ok = !merged.error;

    if (!force) {
      todaysWorkCache = { key: cacheKey, loadedAt: Date.now(), data: merged };
    }
    return merged;
  };

  if (!force) {
    todaysWorkInFlight = run();
    try {
      return await todaysWorkInFlight;
    } finally {
      todaysWorkInFlight = null;
    }
  }

  return run();
}

/** @deprecated Use loadHqTodaysWorkBundle */
export const loadHqPrioritiesBundle = loadHqTodaysWorkBundle;

/**
 * Per-card loaders for progressive Today's Work rendering.
 * Each card fetches only the data it needs; users read is shared between users + audit cards.
 * @param {string} tenantId
 * @param {{ force?: boolean }} [options]
 */
export function createTodaysWorkCardLoaders(tenantId, options = {}) {
  const tid = str(tenantId);
  const force = options.force === true;
  const readOpts = force ? { force: true } : {};

  /** @type {Promise<{ directoryUsers: object[], error?: string }>|null} */
  let usersLoad = null;
  const loadDirectoryUsers = () => {
    if (!usersLoad) {
      usersLoad = getOperationsPlatformUsersRead({ tenantId: tid }).then((usersRes) => ({
        directoryUsers: mapDirectoryUsers(usersRes),
        error: usersRes?.error || null,
      }));
    }
    return usersLoad;
  };

  return {
    inventory: () => loadTodaysWorkInventorySlice(),
    collections: async () => {
      const collRes = await getCollectionsRead(readOpts);
      return {
        slice: {
          collections: Array.isArray(collRes?.data?.collections) ? collRes.data.collections : [],
        },
        error: collRes?.error || null,
      };
    },
    orders: () => loadTodaysWorkOrdersSlice(),
    users: async () => {
      const { directoryUsers, error } = await loadDirectoryUsers();
      return { slice: { directoryUsers }, error };
    },
    audit: async () => {
      const [{ directoryUsers }, auditRes] = await Promise.all([
        loadDirectoryUsers(),
        getUserProvisioningEventsRead({ tenantId: tid, limit: 100 }),
      ]);
      return {
        slice: { auditEvents: mapAuditEvents(auditRes, directoryUsers) },
        error: auditRes?.error || null,
      };
    },
  };
}
