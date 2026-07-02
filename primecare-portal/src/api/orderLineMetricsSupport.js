/**
 * Schema-tolerant order line reads — production `order_lines` vs `order_items` column drift.
 */

export const ORDER_LINES_METRIC_COLUMNS =
  "order_id,quantity,unit_selling_price,net_line_total";

export const ORDER_ITEMS_METRIC_COLUMNS = "order_id,quantity,unit_price,total_price";

export const ORDER_LINES_DETAIL_COLUMNS =
  "order_id,product_id,product_name,quantity,unit_selling_price,net_line_total";

export const ORDER_ITEMS_DETAIL_COLUMNS =
  "order_id,product_id,product_name,quantity,unit_price,total_price";

const ORDER_LINE_MINIMAL_COLUMNS = "order_id,quantity";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve a line total from whichever price/total columns exist on the row.
 */
export function resolveOrderLineTotal(row) {
  if (!row) return 0;
  const direct = num(
    row.net_line_total ??
      row.netLineTotal ??
      row.total_price ??
      row.totalPrice ??
      row.line_total ??
      row.lineTotal ??
      row.total
  );
  if (direct > 0) return direct;

  const qty = num(row.quantity);
  const unit = num(
    row.unit_selling_price ??
      row.unitSellingPrice ??
      row.unit_price ??
      row.unitPrice ??
      row.price
  );
  if (qty > 0 && unit > 0) return qty * unit;
  return 0;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} table
 * @param {string} columns
 * @param {string} orderIdColumn
 * @param {string} orderIdValue
 */
async function queryOrderLines(client, table, columns, orderIdColumn, orderIdValue) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq(orderIdColumn, orderIdValue);
  if (error) return { data: [], error };
  return { data: Array.isArray(data) ? data : [], error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} table
 * @param {string} primaryColumns
 * @param {string[]} orderIdValues
 */
async function queryOrderLinesChunk(client, table, primaryColumns, orderIdValues) {
  const ids = [...new Set(orderIdValues.map(str).filter(Boolean))];
  if (!ids.length) return { data: [], error: null };

  const primary = await client.from(table).select(primaryColumns).in("order_id", ids);
  if (!primary.error) {
    return { data: Array.isArray(primary.data) ? primary.data : [], error: null };
  }

  const fallback = await client.from(table).select(ORDER_LINE_MINIMAL_COLUMNS).in("order_id", ids);
  if (fallback.error) {
    return { data: [], error: fallback.error };
  }
  return { data: Array.isArray(fallback.data) ? fallback.data : [], error: null };
}

function orderRowHasHeaderTotal(orderRow) {
  return num(orderRow?.total_amount ?? orderRow?.totalAmount ?? orderRow?.order_total) > 0;
}

function orderIdsCoveredByLineRows(lineRows) {
  const covered = new Set();
  for (const row of lineRows || []) {
    const oid = str(row.order_id ?? row.orderId);
    if (oid && (resolveOrderLineTotal(row) > 0 || num(row.quantity) > 0)) {
      covered.add(oid);
    }
  }
  return covered;
}

function ordersNeedingLineFallback(ordersRaw, coveredOrderIds) {
  const need = [];
  for (const o of ordersRaw || []) {
    if (orderRowHasHeaderTotal(o)) continue;
    const business = str(o.order_id ?? o.orderId);
    const uuid = o.id != null ? str(o.id) : "";
    const keys = [business, uuid].filter(Boolean);
    if (keys.some((k) => coveredOrderIds.has(k))) continue;
    if (business) need.push(business);
    else if (uuid) need.push(uuid);
  }
  return [...new Set(need)];
}

/**
 * Shadow-safe fallback: read pre-materialized totals from proj_order_v1 (flags stay OFF).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} tenantId
 * @param {string[]} businessOrderIds
 */
export async function fetchProjectionOrderLineMetricsForOrders(client, tenantId, businessOrderIds) {
  const rows = [];
  const tid = str(tenantId);
  const ids = [...new Set(businessOrderIds.map(str).filter(Boolean))];
  if (!client || !tid || !ids.length) {
    return { rows, error: null };
  }

  const chunkSize = 50;
  let lastError = null;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("proj_order_v1")
      .select("order_id,total_amount,item_count")
      .eq("tenant_id", tid)
      .in("order_id", chunk);
    if (error) {
      lastError = error;
      continue;
    }
    for (const row of data || []) {
      const oid = str(row.order_id);
      if (!oid) continue;
      const total = num(row.total_amount);
      const qty = num(row.item_count);
      rows.push({
        order_id: oid,
        quantity: qty,
        total_price: total,
        net_line_total: total,
        _projectionFallback: true,
      });
    }
  }
  return { rows, error: lastError };
}

/**
 * Secondary dashboard fallback — read_orders_list_v1 RPC (no transactional line tables).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string[]} needIds
 * @param {number} daysBack
 */
async function fetchDashboardLineMetricsFromOrdersListRpc(client, needIds, daysBack) {
  const needSet = new Set(needIds.map(str).filter(Boolean));
  if (!client || !needSet.size) {
    return { rows: [], error: null };
  }

  const { data, error } = await client.rpc("read_orders_list_v1", {
    p_limit: 500,
    p_offset: 0,
    p_days_back: Math.max(1, Number(daysBack) || 90),
  });
  if (error) {
    return { rows: [], error: error.message || String(error) };
  }

  const payload = data && typeof data === "object" ? data : {};
  const rawOrders = payload?.data?.orders ?? payload?.orders ?? [];
  const rows = [];
  for (const row of rawOrders || []) {
    const oid = str(row.order_id ?? row.orderId);
    if (!oid || !needSet.has(oid)) continue;
    const total = num(row.total_amount ?? row.totalAmount);
    const qty = num(row.item_count ?? row.itemCount);
    if (total <= 0 && qty <= 0) continue;
    rows.push({
      order_id: oid,
      quantity: qty,
      total_price: total,
      net_line_total: total,
      _projectionFallback: true,
      _rpcFallback: true,
    });
  }
  return { rows, error: null };
}

/**
 * Admin Dashboard bounded path — projection-only line revenue enrichment.
 * Never queries order_lines or order_items (avoids PostgREST fan-out 500s).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} tenantId
 * @param {object[]} ordersRaw
 * @param {{ daysBack?: number }} [options]
 */
export async function fetchDashboardLineMetricsFromProjection(client, tenantId, ordersRaw, options = {}) {
  const empty = { rows: [], errors: {}, itemMetricsDegraded: false };
  if (!client || !Array.isArray(ordersRaw) || !ordersRaw.length) return empty;

  const needFallback = ordersNeedingLineFallback(ordersRaw, new Set());
  if (!needFallback.length) return empty;

  const tid = str(tenantId);
  if (!tid) {
    return {
      rows: [],
      errors: { projection: "missing tenant_id for proj_order_v1" },
      itemMetricsDegraded: true,
    };
  }

  const rows = [];
  const errors = {};
  let itemMetricsDegraded = false;
  const daysBack = options.daysBack;

  const proj = await fetchProjectionOrderLineMetricsForOrders(client, tid, needFallback);
  if (proj.error) {
    errors.projection = proj.error.message || String(proj.error);
    itemMetricsDegraded = true;
  }
  rows.push(...(proj.rows || []));

  let covered = orderIdsCoveredByLineRows(rows);
  let stillNeed = ordersNeedingLineFallback(ordersRaw, covered);

  if (stillNeed.length) {
    const rpc = await fetchDashboardLineMetricsFromOrdersListRpc(client, stillNeed, daysBack);
    if (rpc.error) {
      errors.read_orders_list_v1 = rpc.error;
      itemMetricsDegraded = true;
    } else if (rpc.rows.length) {
      rows.push(...rpc.rows);
      covered = orderIdsCoveredByLineRows(rows);
      stillNeed = ordersNeedingLineFallback(ordersRaw, covered);
    }
  }

  if (stillNeed.length) {
    itemMetricsDegraded = true;
    if (!errors.projection && !errors.read_orders_list_v1) {
      errors.projection = `line totals unavailable for ${stillNeed.length} order(s)`;
    }
  }

  const withTotals = rows.filter((row) => resolveOrderLineTotal(row) > 0 || num(row.quantity) > 0);
  return { rows: withTotals, errors, itemMetricsDegraded };
}

/**
 * Bounded metric rows for dashboard / predator rollups (chunked by order_id).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string[]} orderIds
 * @param {{
 *   ordersRaw?: object[],
 *   tenantId?: string,
 *   chunkSize?: number,
 *   itemsChunkSize?: number,
 *   useProjectionFallback?: boolean,
 * }} [options]
 */
export async function fetchOrderLineMetricsForOrders(client, orderIds, options = {}) {
  const {
    ordersRaw = [],
    tenantId = "",
    chunkSize = 20,
    itemsChunkSize = 10,
    useProjectionFallback = true,
  } = options;

  const empty = { rows: [], errors: {}, itemMetricsDegraded: false };
  const ids = [...new Set(orderIds.map(str).filter(Boolean))];
  if (!client || !ids.length) return empty;

  if (ordersRaw.length && !ordersNeedingLineFallback(ordersRaw, new Set())) {
    return empty;
  }

  const rows = [];
  const errors = {};
  let itemMetricsDegraded = false;
  const lineChunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    lineChunks.push(ids.slice(i, i + chunkSize));
  }

  await Promise.all(
    lineChunks.map(async (chunk) => {
      const linesRes = await queryOrderLinesChunk(
        client,
        "order_lines",
        ORDER_LINES_METRIC_COLUMNS,
        chunk
      );
      if (linesRes.error) {
        errors.order_lines = linesRes.error.message || String(linesRes.error);
        itemMetricsDegraded = true;
        return;
      }
      rows.push(...linesRes.data);
    })
  );

  const covered = orderIdsCoveredByLineRows(rows);
  const needItems = ordersRaw.length
    ? ordersNeedingLineFallback(ordersRaw, covered)
    : ids.filter((id) => !covered.has(id));

  if (needItems.length) {
    const itemChunks = [];
    for (let i = 0; i < needItems.length; i += itemsChunkSize) {
      itemChunks.push(needItems.slice(i, i + itemsChunkSize));
    }
    await Promise.all(
      itemChunks.map(async (chunk) => {
        try {
          const itemsRes = await queryOrderLinesChunk(
            client,
            "order_items",
            ORDER_ITEMS_METRIC_COLUMNS,
            chunk
          );
          if (itemsRes.error) {
            errors.order_items = itemsRes.error.message || String(itemsRes.error);
            itemMetricsDegraded = true;
            return;
          }
          rows.push(...itemsRes.data);
        } catch (err) {
          errors.order_items = err?.message || String(err);
          itemMetricsDegraded = true;
        }
      })
    );
  }

  if (useProjectionFallback && tenantId) {
    const coveredAfterItems = orderIdsCoveredByLineRows(rows);
    const stillNeed = ordersRaw.length
      ? ordersNeedingLineFallback(ordersRaw, coveredAfterItems)
      : ids.filter((id) => !coveredAfterItems.has(id));
    if (stillNeed.length) {
      const proj = await fetchProjectionOrderLineMetricsForOrders(client, tenantId, stillNeed);
      if (proj.error) {
        errors.projection = proj.error.message || String(proj.error);
        itemMetricsDegraded = true;
      }
      if (proj.rows.length) {
        rows.push(...proj.rows);
        itemMetricsDegraded = true;
      }
    }
  }

  const withTotals = rows.filter((row) => resolveOrderLineTotal(row) > 0 || num(row.quantity) > 0);
  if (!withTotals.length && (errors.order_lines || errors.order_items)) {
    console.warn("[fetchOrderLineMetricsForOrders] line metrics degraded:", errors);
  }

  return {
    rows: withTotals,
    errors,
    itemMetricsDegraded,
  };
}

/**
 * Detail lines for a single order (order_lines first, then order_items).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ id?: string, order_id?: string, orderId?: string }} orderRow
 */
/**
 * Sum unit quantities per order_id — prefers order_lines when present, else order_items.
 * Matches lab checkout confirmation and order detail reads.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string[]} orderIds
 */
/** Propagate unit counts across business order_id and UUID keys for the same row. */
export function mergeOrderMetricCountAliases(counts, ordersRaw = []) {
  if (!counts?.size) return counts;
  for (const o of ordersRaw || []) {
    const business = str(o.order_id ?? o.orderId);
    const uuid = o.id != null ? str(o.id) : "";
    if (!business || !uuid || business === uuid) continue;
    const merged = Math.max(counts.get(business) || 0, counts.get(uuid) || 0);
    if (merged > 0) {
      counts.set(business, merged);
      counts.set(uuid, merged);
    }
  }
  return counts;
}

export async function fetchOrderUnitCountsForOrders(client, orderIds, ordersRaw = []) {
  const counts = new Map();
  const ids = [...new Set(orderIds.map(str).filter(Boolean))];
  if (!client || !ids.length) return counts;

  const linesQty = new Map();
  const itemsQty = new Map();
  const linesPresent = new Set();
  const itemsPresent = new Set();
  /** Small chunks — large `.in()` on order_items/order_lines can statement-timeout on QA. */
  const chunkSize = 20;

  const accumulate = (rows, qtyMap, presentSet) => {
    for (const row of rows || []) {
      const oid = str(row.order_id ?? row.orderId);
      if (!oid) continue;
      presentSet.add(oid);
      qtyMap.set(oid, (qtyMap.get(oid) || 0) + num(row.quantity));
    }
  };

  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const linesRes = await queryOrderLinesChunk(
        client,
        "order_lines",
        ORDER_LINE_MINIMAL_COLUMNS,
        chunk
      );
      if (!linesRes.error) accumulate(linesRes.data, linesQty, linesPresent);

      const needsItems = chunk.some((oid) => !linesPresent.has(oid) || (linesQty.get(oid) || 0) <= 0);
      if (!needsItems) return;

      try {
        const itemsRes = await queryOrderLinesChunk(
          client,
          "order_items",
          ORDER_LINE_MINIMAL_COLUMNS,
          chunk
        );
        if (!itemsRes.error) accumulate(itemsRes.data, itemsQty, itemsPresent);
      } catch {
        /* order_items timeout must not break list item counts when order_lines exist */
      }
    })
  );

  for (const oid of ids) {
    const lineQ = linesPresent.has(oid) ? linesQty.get(oid) || 0 : 0;
    const itemQ = itemsPresent.has(oid) ? itemsQty.get(oid) || 0 : 0;
    let count = 0;
    if (linesPresent.has(oid) && lineQ > 0) count = lineQ;
    else if (itemsPresent.has(oid) && itemQ > 0) count = itemQ;
    else if (linesPresent.has(oid)) count = lineQ;
    else if (itemsPresent.has(oid)) count = itemQ;
    counts.set(oid, count);
  }

  return mergeOrderMetricCountAliases(counts, ordersRaw);
}

export async function fetchOrderDetailLinesForOrder(client, orderRow) {
  if (!client || !orderRow) return { lines: [], error: null };

  const fk = str(orderRow.id ?? orderRow.order_id ?? orderRow.orderId);
  const businessOrderId = str(orderRow.order_id ?? orderRow.orderId);
  const keys = [...new Set([fk, businessOrderId].filter(Boolean))];

  for (const orderKey of keys) {
    const linesRes = await queryOrderLines(
      client,
      "order_lines",
      ORDER_LINES_DETAIL_COLUMNS,
      "order_id",
      orderKey
    );
    if (linesRes.data.length) return { lines: linesRes.data, error: null };
    if (linesRes.error) {
      const minimal = await queryOrderLines(
        client,
        "order_lines",
        ORDER_LINE_MINIMAL_COLUMNS,
        "order_id",
        orderKey
      );
      if (minimal.data.length) return { lines: minimal.data, error: null };
    }
  }

  for (const orderKey of keys) {
    const itemsRes = await queryOrderLines(
      client,
      "order_items",
      ORDER_ITEMS_DETAIL_COLUMNS,
      "order_id",
      orderKey
    );
    if (itemsRes.data.length) return { lines: itemsRes.data, error: null };
    if (itemsRes.error) {
      const minimal = await queryOrderLines(
        client,
        "order_items",
        ORDER_LINE_MINIMAL_COLUMNS,
        "order_id",
        orderKey
      );
      if (minimal.data.length) return { lines: minimal.data, error: null };
      return { lines: [], error: itemsRes.error };
    }
  }

  return { lines: [], error: null };
}
