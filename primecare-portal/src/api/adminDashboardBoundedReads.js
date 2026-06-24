/**
 * Bounded Admin Dashboard source reads — shared by getAdminDashboardRead and QA validation.
 * Same tenant (RLS session), date window, column projections, and row limits.
 */
import {
  HQ_AGENT_VISIT_COLUMNS,
  HQ_AR_COLUMNS,
  HQ_COLLECTIONS_AR_LIMIT,
  HQ_DASHBOARD_ORDERS_LIMIT,
  HQ_DASHBOARD_RECENT_DAYS,
  HQ_DASHBOARD_VISITS_LIMIT,
  HQ_INVENTORY_COLUMNS,
  HQ_LABS_NAME_COLUMNS,
  HQ_ORDER_LINE_METRIC_COLUMNS,
  HQ_ORDER_LIST_COLUMNS,
  recentDateYmd,
  clampLimit,
} from "@/api/hqReadBounds.js";
import { collectOrderRowIds } from "@/metrics/computeRevenueMetrics.js";

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
 * @param {import('@supabase/supabase-js').SupabaseClient|null|undefined} client
 */
export async function fetchAdminDashboardBoundedSourceRows(client) {
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

  const recentFrom = empty.recentFrom;
  const errors = {};

  const ordersQuery = client
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .gte("order_date", recentFrom)
    .order("order_date", { ascending: false })
    .limit(HQ_DASHBOARD_ORDERS_LIMIT);

  const [ordersRes, arRes, visitsRes, invRes, labsRes] = await Promise.all([
    ordersQuery,
    fetchCollectionsBoundedArRows(client),
    fetchAgentVisitsBoundedRows(client),
    client.from("inventory").select(HQ_INVENTORY_COLUMNS),
    client.from("labs").select(HQ_LABS_NAME_COLUMNS),
  ]);

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
    orderLinesRaw = await fetchOrderLineMetricsForOrders(client, orderIds);
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
      inventory: `inventory.select(${HQ_INVENTORY_COLUMNS})`,
      labs: `labs.select(${HQ_LABS_NAME_COLUMNS})`,
      order_lines: orderIds.length
        ? `order_lines.in(order_id,${orderIds.length} ids chunked)`
        : "skipped (no orders in window)",
    },
  };
}
