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
  HQ_ORDER_LINE_METRIC_COLUMNS,
  HQ_ORDER_LIST_COLUMNS,
  HQ_PAYMENT_COLUMNS,
  HQ_PAYMENTS_RECENT_DAYS,
  HQ_PAYMENTS_RECENT_LIMIT,
  HQ_PURCHASE_ORDER_COLUMNS,
  HQ_PURCHASE_ORDER_LIMIT,
  HQ_QUALIFICATION_COLUMNS,
  HQ_QUALIFICATION_LIMIT,
  HQ_SEARCH_CATALOG_LIMIT,
  HQ_SEARCH_STOCK_LIMIT,
  HQ_V_LAB_CATALOG_COLUMNS,
  HQ_V_LABS_CREDIT_LIST_COLUMNS,
  HQ_V_STOCK_DASHBOARD_COLUMNS,
  clampLimit,
  recentDateYmd,
} from "./hqReadBounds.js";
import { collectOrderRowIds } from "../metrics/computeRevenueMetrics.js";

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
    fetchInventoryBoundedRows(client, { limit: HQ_INVENTORY_HEALTH_LIMIT }),
    client.from("labs").select(HQ_LABS_NAME_COLUMNS).limit(HQ_LABS_CREDIT_LIMIT),
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
      inventory: `inventory.select(${HQ_INVENTORY_HEALTH_COLUMNS}).limit(${HQ_INVENTORY_HEALTH_LIMIT})`,
      labs: `labs.select(${HQ_LABS_NAME_COLUMNS}).limit(${HQ_LABS_CREDIT_LIMIT})`,
      order_lines: orderIds.length
        ? `order_lines.in(order_id,${orderIds.length} ids chunked)`
        : "skipped (no orders in window)",
    },
  };
}
