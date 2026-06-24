/**
 * Shared bounded HQ reads — production APIs, Predator validators, QA validation, cert scripts.
 * Same tenant (RLS session), column projections, date windows, and row limits.
 */
import {
  HQ_AGENT_VISIT_COLUMNS,
  HQ_AR_COLUMNS,
  HQ_COLLECTIONS_AR_LIMIT,
  HQ_DASHBOARD_ORDERS_LIMIT,
  HQ_DASHBOARD_RECENT_DAYS,
  HQ_DASHBOARD_VISITS_LIMIT,
  HQ_INVENTORY_HEALTH_COLUMNS,
  HQ_INVENTORY_HEALTH_LIMIT,
  HQ_INVENTORY_LEDGER_COLUMNS,
  HQ_INVENTORY_LEDGER_LIMIT,
  HQ_INVENTORY_LEDGER_RECENT_DAYS,
  HQ_LABS_NAME_COLUMNS,
  HQ_LABS_CREDIT_LIMIT,
  HQ_LAB_CATALOG_LIMIT,
  HQ_LAB_CATALOG_LIST_COLUMNS,
  HQ_ORDER_LINE_METRIC_COLUMNS,
  HQ_ORDER_LIST_COLUMNS,
  HQ_PAYMENT_COLUMNS,
  HQ_PAYMENTS_RECENT_DAYS,
  HQ_PAYMENTS_RECENT_LIMIT,
  HQ_PURCHASE_ORDER_COLUMNS,
  HQ_PURCHASE_ORDER_LIMIT,
  HQ_QUALIFICATION_COLUMNS,
  HQ_QUALIFICATION_LIMIT,
  HQ_READ_CACHE_TTL_MS,
  HQ_REORDER_CANDIDATE_COLUMNS,
  HQ_REORDER_CANDIDATES_LIMIT,
  HQ_SEARCH_CATALOG_LIMIT,
  HQ_SEARCH_STOCK_LIMIT,
  HQ_STOCK_DASHBOARD_LIMIT,
  HQ_V_LAB_CATALOG_COLUMNS,
  HQ_V_LABS_CREDIT_LIST_COLUMNS,
  HQ_V_STOCK_DASHBOARD_COLUMNS,
  clampLimit,
  recentDateYmd,
} from "./hqReadBounds.js";
import { collectOrderRowIds } from "../metrics/computeRevenueMetrics.js";
import { perfLog, perfTime } from "../utils/perfLog.js";

const BOUNDED_SOURCE_CACHE_TTL_MS = 30_000;

/** @type {{ loadedAt: number, data: object|null, inFlight: Promise<object>|null }} */
let boundedSourceCache = { loadedAt: 0, data: null, inFlight: null };

export function invalidateBoundedSourceCache() {
  boundedSourceCache = { loadedAt: 0, data: null, inFlight: null };
  invalidateStockDashboardReadCache();
  invalidateLabCatalogReadCache();
  invalidateInventoryLedgerReadCache();
}

/** @type {{ loadedAt: number, data: object|null, inFlight: Promise<object>|null }} */
let stockDashboardCache = { loadedAt: 0, data: null, inFlight: null };
/** @type {{ loadedAt: number, data: object|null, inFlight: Promise<object>|null, key: string }} */
let labCatalogCache = { loadedAt: 0, data: null, inFlight: null, key: "" };
/** @type {{ loadedAt: number, data: object|null, inFlight: Promise<object>|null }} */
let inventoryLedgerCache = { loadedAt: 0, data: null, inFlight: null };
/** @type {{ loadedAt: number, data: object|null, inFlight: Promise<object>|null }} */
let reorderForecastCache = { loadedAt: 0, data: null, inFlight: null };

export function invalidateStockDashboardReadCache() {
  stockDashboardCache = { loadedAt: 0, data: null, inFlight: null };
  reorderForecastCache = { loadedAt: 0, data: null, inFlight: null };
}

export function invalidateLabCatalogReadCache() {
  labCatalogCache = { loadedAt: 0, data: null, inFlight: null, key: "" };
}

export function invalidateInventoryLedgerReadCache() {
  inventoryLedgerCache = { loadedAt: 0, data: null, inFlight: null };
}

/**
 * Bounded v_stock_dashboard read.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 */
export async function fetchStockDashboardBoundedRows(client) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  return client
    .from("v_stock_dashboard")
    .select(HQ_V_STOCK_DASHBOARD_COLUMNS)
    .limit(HQ_STOCK_DASHBOARD_LIMIT);
}

/**
 * Bounded v_lab_catalog read.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 */
export async function fetchLabCatalogBoundedRows(client) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  return client
    .from("v_lab_catalog")
    .select(HQ_LAB_CATALOG_LIST_COLUMNS)
    .limit(HQ_LAB_CATALOG_LIMIT);
}

/**
 * Bounded v_reorder_candidates read.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 */
export async function fetchReorderCandidatesBoundedRows(client) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  return client
    .from("v_reorder_candidates")
    .select(HQ_REORDER_CANDIDATE_COLUMNS)
    .limit(HQ_REORDER_CANDIDATES_LIMIT);
}

/**
 * Cached bounded stock dashboard rows.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ force?: boolean }} [options]
 */
export async function loadStockDashboardBoundedRows(client, options = {}) {
  const force = options.force === true;
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  if (
    !force &&
    stockDashboardCache.data &&
    Date.now() - stockDashboardCache.loadedAt < HQ_READ_CACHE_TTL_MS
  ) {
    return stockDashboardCache.data;
  }
  if (!force && stockDashboardCache.inFlight) {
    return stockDashboardCache.inFlight;
  }
  const load = fetchStockDashboardBoundedRows(client);
  if (!force) stockDashboardCache.inFlight = load;
  try {
    const res = await load;
    if (!force && !res.error) {
      stockDashboardCache.data = res;
      stockDashboardCache.loadedAt = Date.now();
    }
    return res;
  } finally {
    if (!force) stockDashboardCache.inFlight = null;
  }
}

/**
 * Cached bounded lab catalog rows.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ force?: boolean, cacheKey?: string }} [options]
 */
export async function loadLabCatalogBoundedRows(client, options = {}) {
  const force = options.force === true;
  const cacheKey = str(options.cacheKey) || "default";
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  if (
    !force &&
    labCatalogCache.data &&
    labCatalogCache.key === cacheKey &&
    Date.now() - labCatalogCache.loadedAt < HQ_READ_CACHE_TTL_MS
  ) {
    return labCatalogCache.data;
  }
  if (!force && labCatalogCache.inFlight) {
    return labCatalogCache.inFlight;
  }
  const load = fetchLabCatalogBoundedRows(client);
  if (!force) labCatalogCache.inFlight = load;
  try {
    const res = await load;
    if (!force && !res.error) {
      labCatalogCache.data = res;
      labCatalogCache.loadedAt = Date.now();
      labCatalogCache.key = cacheKey;
    }
    return res;
  } finally {
    if (!force) labCatalogCache.inFlight = null;
  }
}

/**
 * Cached bounded inventory ledger rows.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ force?: boolean, daysBack?: number }} [options]
 */
export async function loadInventoryLedgerBoundedRows(client, options = {}) {
  const force = options.force === true;
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  if (
    !force &&
    inventoryLedgerCache.data &&
    Date.now() - inventoryLedgerCache.loadedAt < HQ_READ_CACHE_TTL_MS
  ) {
    return inventoryLedgerCache.data;
  }
  if (!force && inventoryLedgerCache.inFlight) {
    return inventoryLedgerCache.inFlight;
  }
  const load = fetchInventoryLedgerBoundedRows(client, options);
  if (!force) inventoryLedgerCache.inFlight = load;
  try {
    const res = await load;
    if (!force && !res.error) {
      inventoryLedgerCache.data = res;
      inventoryLedgerCache.loadedAt = Date.now();
    }
    return res;
  } finally {
    if (!force) inventoryLedgerCache.inFlight = null;
  }
}

/**
 * Cached bounded reorder forecast rows.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ force?: boolean }} [options]
 */
export async function loadReorderCandidatesBoundedRows(client, options = {}) {
  const force = options.force === true;
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  if (
    !force &&
    reorderForecastCache.data &&
    Date.now() - reorderForecastCache.loadedAt < HQ_READ_CACHE_TTL_MS
  ) {
    return reorderForecastCache.data;
  }
  if (!force && reorderForecastCache.inFlight) {
    return reorderForecastCache.inFlight;
  }
  const load = fetchReorderCandidatesBoundedRows(client);
  if (!force) reorderForecastCache.inFlight = load;
  try {
    const res = await load;
    if (!force && !res.error) {
      reorderForecastCache.data = res;
      reorderForecastCache.loadedAt = Date.now();
    }
    return res;
  } finally {
    if (!force) reorderForecastCache.inFlight = null;
  }
}

/**
 * Bounded payments for a single lab (recent window).
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {string} labId
 * @param {{ daysBack?: number, limit?: number }} [options]
 */
export async function fetchPaymentsForLabBoundedRows(client, labId, options = {}) {
  if (!client || !str(labId)) {
    return { data: [], error: { message: "Supabase client or lab_id not configured" } };
  }
  const daysBack =
    Number(options.daysBack) > 0 ? Number(options.daysBack) : HQ_PAYMENTS_RECENT_DAYS;
  const limit = clampLimit(options.limit, HQ_PAYMENTS_RECENT_LIMIT, HQ_PAYMENTS_RECENT_LIMIT);
  const recentFrom = recentDateYmd(daysBack);
  return client
    .from("payments")
    .select(HQ_PAYMENT_COLUMNS)
    .eq("lab_id", str(labId))
    .gte("payment_date", recentFrom)
    .order("payment_date", { ascending: false })
    .limit(limit);
}

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string[]} orderIds
 */
async function fetchOrderLineMetricsForOrders(client, orderIds) {
  const rows = [];
  if (!client || !orderIds?.length) return rows;

  const ids = [...new Set(orderIds.map(str).filter(Boolean))];
  const chunkSize = 200;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    try {
      const { data, error } = await client
        .from("order_lines")
        .select(HQ_ORDER_LINE_METRIC_COLUMNS)
        .in("order_id", chunk);
      if (!error && Array.isArray(data)) rows.push(...data);
    } catch {
      /* optional */
    }
    try {
      const { data, error } = await client
        .from("order_items")
        .select(HQ_ORDER_LINE_METRIC_COLUMNS)
        .in("order_id", chunk);
      if (!error && Array.isArray(data)) rows.push(...data);
    } catch {
      /* optional */
    }
  }

  return rows;
}

/**
 * Bounded AR read — shared by getCollectionsRead and Collections Predator validation.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ limit?: number }} [options]
 */
export async function fetchCollectionsBoundedArRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const limit = clampLimit(options.limit, HQ_COLLECTIONS_AR_LIMIT, HQ_COLLECTIONS_AR_LIMIT);
  return client
    .from("ar_credit_control")
    .select(HQ_AR_COLUMNS)
    .limit(limit);
}

/**
 * Bounded agent visits read — shared by getAgentWorkspaceRead and Agent Visits validation.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 */
export async function fetchAgentVisitsBoundedRows(client) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  return client
    .from("agent_visits")
    .select(HQ_AGENT_VISIT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(HQ_DASHBOARD_VISITS_LIMIT);
}

/**
 * Bounded lab qualifications — shared by getQualificationReviewRead and Predator validation.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ limit?: number, offset?: number }} [options]
 */
export async function fetchQualificationBoundedRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const limit = clampLimit(options.limit, HQ_QUALIFICATION_LIMIT, HQ_QUALIFICATION_LIMIT);
  const offset = Math.max(0, Number(options.offset) || 0);
  return client
    .from("lab_qualifications")
    .select(HQ_QUALIFICATION_COLUMNS)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
}

/**
 * Bounded v_labs_credit read — shared by getLabsCredit, getAgentWorkspaceRead, validators.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ limit?: number, columns?: string }} [options]
 */
export async function fetchLabsCreditBoundedRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const limit = clampLimit(options.limit, HQ_LABS_CREDIT_LIMIT, HQ_LABS_CREDIT_LIMIT);
  const columns = str(options.columns) || HQ_V_LABS_CREDIT_LIST_COLUMNS;
  return client.from("v_labs_credit").select(columns).limit(limit);
}

/**
 * Bounded recent payments — shared by getCollectionsRead and commission engine.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ daysBack?: number, limit?: number, paymentDateEq?: string }} [options]
 */
export async function fetchPaymentsBoundedRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const daysBack =
    Number(options.daysBack) > 0 ? Number(options.daysBack) : HQ_PAYMENTS_RECENT_DAYS;
  const limit = clampLimit(options.limit, HQ_PAYMENTS_RECENT_LIMIT, HQ_PAYMENTS_RECENT_LIMIT);
  const recentFrom = recentDateYmd(daysBack);
  const paymentDateEq = str(options.paymentDateEq);

  if (paymentDateEq) {
    return client
      .from("payments")
      .select(HQ_PAYMENT_COLUMNS)
      .eq("payment_date", paymentDateEq)
      .limit(limit);
  }

  return client
    .from("payments")
    .select(HQ_PAYMENT_COLUMNS)
    .gte("payment_date", recentFrom)
    .order("payment_date", { ascending: false })
    .limit(limit);
}

/**
 * Bounded order lines for commission / rollups.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ limit?: number }} [options]
 */
export async function fetchOrderLinesBoundedRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const limit = clampLimit(options.limit, 5000, 5000);
  return client
    .from("order_lines")
    .select(HQ_ORDER_LINE_METRIC_COLUMNS)
    .order("order_id", { ascending: false })
    .limit(limit);
}

/**
 * Bounded inventory rows for health KPIs.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ limit?: number }} [options]
 */
export async function fetchInventoryBoundedRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const limit = clampLimit(options.limit, HQ_INVENTORY_HEALTH_LIMIT, HQ_INVENTORY_HEALTH_LIMIT);
  return client.from("inventory").select(HQ_INVENTORY_HEALTH_COLUMNS).limit(limit);
}

/**
 * Bounded inventory ledger for health KPIs (recent window + limit).
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ daysBack?: number, limit?: number }} [options]
 */
export async function fetchInventoryLedgerBoundedRows(client, options = {}) {
  if (!client) {
    return { data: [], error: { message: "Supabase client not configured" } };
  }
  const daysBack =
    Number(options.daysBack) > 0 ? Number(options.daysBack) : HQ_INVENTORY_LEDGER_RECENT_DAYS;
  const limit = clampLimit(options.limit, HQ_INVENTORY_LEDGER_LIMIT, HQ_INVENTORY_LEDGER_LIMIT);
  const recentFrom = recentDateYmd(daysBack);
  return client
    .from("inventory_ledger")
    .select(HQ_INVENTORY_LEDGER_COLUMNS)
    .gte("created_at", `${recentFrom}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(limit);
}

/**
 * Bounded sources for HQ global search runtime certification.
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 */
export async function fetchSearchRuntimeBoundedSources(client) {
  if (!client) {
    return {
      labsRes: { data: [], error: { message: "Supabase client not configured" } },
      ordersRes: { data: [], error: null },
      catalogRes: { data: [], error: null },
      stockRes: { data: [], error: null },
      poRes: { data: [], error: null },
    };
  }

  const recentFrom = recentDateYmd(HQ_DASHBOARD_RECENT_DAYS);

  const [labsRes, ordersRes, catalogRes, stockRes, poRes] = await Promise.all([
    fetchLabsCreditBoundedRows(client, {
      columns: "lab_id,lab_name,tenant_id,area,owner_name,assigned_agent_id",
    }),
    client
      .from("orders")
      .select(HQ_ORDER_LIST_COLUMNS)
      .gte("order_date", recentFrom)
      .order("order_date", { ascending: false })
      .limit(HQ_DASHBOARD_ORDERS_LIMIT),
    client.from("v_lab_catalog").select(HQ_V_LAB_CATALOG_COLUMNS).limit(HQ_SEARCH_CATALOG_LIMIT),
    client.from("v_stock_dashboard").select(HQ_V_STOCK_DASHBOARD_COLUMNS).limit(HQ_SEARCH_STOCK_LIMIT),
    client
      .from("purchase_orders")
      .select(HQ_PURCHASE_ORDER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(HQ_PURCHASE_ORDER_LIMIT),
  ]);

  return { labsRes, ordersRes, catalogRes, stockRes, poRes };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 * @param {{ force?: boolean }} [options]
 */
export async function fetchAdminDashboardBoundedSourceRows(client, options = {}) {
  const force = options.force === true;
  const empty = {
    errors: {},
    ordersRaw: [],
    orderIds: [],
    arRaw: [],
    visitsAllRaw: [],
    invRaw: [],
    labsRaw: [],
    orderLinesRaw: [],
    recentFrom: recentDateYmd(HQ_DASHBOARD_RECENT_DAYS),
    queryMeta: {},
  };

  if (!client) {
    return { ...empty, errors: { client: "Supabase client not configured" } };
  }

  if (
    !force &&
    boundedSourceCache.data &&
    Date.now() - boundedSourceCache.loadedAt < BOUNDED_SOURCE_CACHE_TTL_MS
  ) {
    perfLog("fetchAdminDashboardBoundedSourceRows.cacheHit", {
      ageMs: Date.now() - boundedSourceCache.loadedAt,
    });
    return boundedSourceCache.data;
  }

  if (!force && boundedSourceCache.inFlight) {
    perfLog("fetchAdminDashboardBoundedSourceRows.inFlightJoin");
    return boundedSourceCache.inFlight;
  }

  const endTotal = perfTime("fetchAdminDashboardBoundedSourceRows.total");
  const load = loadAdminDashboardBoundedSourceRows(client, empty);
  if (!force) boundedSourceCache.inFlight = load;

  try {
    const data = await load;
    if (!force) {
      boundedSourceCache.data = data;
      boundedSourceCache.loadedAt = Date.now();
    }
    endTotal({
      cacheHit: false,
      orders: data.ordersRaw?.length ?? 0,
      orderLines: data.orderLinesRaw?.length ?? 0,
    });
    return data;
  } finally {
    if (!force) boundedSourceCache.inFlight = null;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {object} empty
 */
async function loadAdminDashboardBoundedSourceRows(client, empty) {
  const recentFrom = empty.recentFrom;
  const errors = {};

  const ordersQuery = client
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .gte("order_date", recentFrom)
    .order("order_date", { ascending: false })
    .limit(HQ_DASHBOARD_ORDERS_LIMIT);

  const endParallel = perfTime("fetchAdminDashboardBoundedSourceRows.parallel");
  const [ordersRes, arRes, visitsRes, invRes, labsRes] = await Promise.all([
    ordersQuery,
    fetchCollectionsBoundedArRows(client),
    fetchAgentVisitsBoundedRows(client),
    fetchInventoryBoundedRows(client, { limit: HQ_INVENTORY_HEALTH_LIMIT }),
    client.from("labs").select(HQ_LABS_NAME_COLUMNS).limit(HQ_LABS_CREDIT_LIMIT),
  ]);
  endParallel({
    orders: ordersRes.error ? 0 : ordersRes.data?.length ?? 0,
    ar: arRes.error ? 0 : arRes.data?.length ?? 0,
    visits: visitsRes.error ? 0 : visitsRes.data?.length ?? 0,
  });

  if (ordersRes.error) errors.orders = ordersRes.error.message;
  if (arRes.error) errors.ar_credit_control = arRes.error.message;
  if (visitsRes.error) errors.agent_visits = visitsRes.error.message;
  if (invRes.error) errors.inventory = invRes.error.message;
  if (labsRes.error) errors.labs = labsRes.error.message;

  const ordersRaw = ordersRes.error ? [] : ordersRes.data || [];
  const orderIds = collectOrderRowIds(ordersRaw);
  const arRaw = arRes.error ? [] : arRes.data || [];
  const visitsAllRaw = visitsRes.error ? [] : visitsRes.data || [];
  const invRaw = invRes.error ? [] : invRes.data || [];
  const labsRaw = labsRes.error ? [] : labsRes.data || [];

  let orderLinesRaw = [];
  if (orderIds.length) {
    const endLines = perfTime("fetchAdminDashboardBoundedSourceRows.orderLines");
    orderLinesRaw = await fetchOrderLineMetricsForOrders(client, orderIds);
    endLines({ orderIds: orderIds.length, lines: orderLinesRaw.length });
  }

  return {
    errors,
    ordersRaw,
    orderIds,
    arRaw,
    visitsAllRaw,
    invRaw,
    labsRaw,
    orderLinesRaw,
    recentFrom,
    queryMeta: {
      orders: `orders.select(${HQ_ORDER_LIST_COLUMNS}).gte(order_date,${recentFrom}).limit(${HQ_DASHBOARD_ORDERS_LIMIT})`,
      ar_credit_control: `ar_credit_control.select(${HQ_AR_COLUMNS}).limit(${HQ_COLLECTIONS_AR_LIMIT})`,
      agent_visits: `agent_visits.select(${HQ_AGENT_VISIT_COLUMNS}).limit(${HQ_DASHBOARD_VISITS_LIMIT})`,
      inventory: `inventory.select(${HQ_INVENTORY_HEALTH_COLUMNS}).limit(${HQ_INVENTORY_HEALTH_LIMIT})`,
      labs: `labs.select(${HQ_LABS_NAME_COLUMNS}).limit(${HQ_LABS_CREDIT_LIMIT})`,
      order_lines: orderIds.length
        ? `order_lines.in(order_id,${orderIds.length} ids chunked)`
        : "skipped (no orders in window)",
    },
  };
}
