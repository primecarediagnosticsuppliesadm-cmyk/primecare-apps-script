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

/**
 * Bounded metric rows for dashboard / predator rollups (chunked by order_id).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string[]} orderIds
 */
export async function fetchOrderLineMetricsForOrders(client, orderIds) {
  const rows = [];
  if (!client || !orderIds?.length) return rows;

  const ids = [...new Set(orderIds.map(str).filter(Boolean))];
  const chunkSize = 200;
  let lastError = null;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);

    const linesRes = await queryOrderLinesChunk(
      client,
      "order_lines",
      ORDER_LINES_METRIC_COLUMNS,
      chunk
    );
    if (linesRes.error) lastError = linesRes.error;
    else rows.push(...linesRes.data);

    const itemsRes = await queryOrderLinesChunk(
      client,
      "order_items",
      ORDER_ITEMS_METRIC_COLUMNS,
      chunk
    );
    if (itemsRes.error) lastError = itemsRes.error;
    else rows.push(...itemsRes.data);
  }

  const withTotals = rows.filter((row) => resolveOrderLineTotal(row) > 0 || num(row.quantity) > 0);
  if (!withTotals.length && lastError) {
    console.warn(
      "[fetchOrderLineMetricsForOrders] No line totals resolved:",
      lastError.message || lastError
    );
  }
  return withTotals;
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
export async function fetchOrderUnitCountsForOrders(client, orderIds) {
  const counts = new Map();
  const ids = [...new Set(orderIds.map(str).filter(Boolean))];
  if (!client || !ids.length) return counts;

  const linesQty = new Map();
  const itemsQty = new Map();
  const linesPresent = new Set();
  const itemsPresent = new Set();
  const chunkSize = 200;

  const accumulate = (rows, qtyMap, presentSet) => {
    for (const row of rows || []) {
      const oid = str(row.order_id ?? row.orderId);
      if (!oid) continue;
      presentSet.add(oid);
      qtyMap.set(oid, (qtyMap.get(oid) || 0) + num(row.quantity));
    }
  };

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const linesRes = await queryOrderLinesChunk(
      client,
      "order_lines",
      ORDER_LINE_MINIMAL_COLUMNS,
      chunk
    );
    if (!linesRes.error) accumulate(linesRes.data, linesQty, linesPresent);

    const itemsRes = await queryOrderLinesChunk(
      client,
      "order_items",
      ORDER_LINE_MINIMAL_COLUMNS,
      chunk
    );
    if (!itemsRes.error) accumulate(itemsRes.data, itemsQty, itemsPresent);
  }

  for (const oid of ids) {
    if (linesPresent.has(oid)) counts.set(oid, linesQty.get(oid) || 0);
    else if (itemsPresent.has(oid)) counts.set(oid, itemsQty.get(oid) || 0);
    else counts.set(oid, 0);
  }

  return counts;
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
