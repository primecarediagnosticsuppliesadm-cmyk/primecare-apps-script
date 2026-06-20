import { normalizeLabIdKey } from "@/utils/labId.js";
import { num, str } from "./primitives.js";

export function buildLineTotalByOrderId(orderItemsRaw) {
  const lineTotalByOrderId = new Map();
  for (const line of orderItemsRaw || []) {
    const oid = str(line.order_id ?? line.orderId);
    if (!oid) continue;
    const lineTotal = num(
      line.total_price ?? line.totalPrice ?? line.net_line_total ?? line.netLineTotal ?? 0
    );
    const qty = num(line.quantity);
    const unit = num(line.unit_price ?? line.unitPrice ?? line.unit_selling_price ?? 0);
    const add = lineTotal > 0 ? lineTotal : qty * unit;
    lineTotalByOrderId.set(oid, (lineTotalByOrderId.get(oid) || 0) + add);
  }
  return lineTotalByOrderId;
}

export function resolveOrderAmount(orderRow, lineTotalByOrderId) {
  const orderKey = str(orderRow.order_id ?? orderRow.orderId ?? orderRow.id);
  let amount = num(
    orderRow.total_amount ??
      orderRow.totalAmount ??
      orderRow.order_total ??
      orderRow.orderTotal ??
      orderRow.amount ??
      0
  );
  if (amount <= 0 && orderKey) {
    amount = num(lineTotalByOrderId.get(orderKey));
  }
  return amount;
}

/** Stable order keys for Admin Dashboard row-count diagnostics (no status/tenant filtering). */
export function collectOrderRowIds(ordersRaw) {
  const ids = [];
  for (const o of ordersRaw || []) {
    const id = str(o.order_id ?? o.orderId ?? o.id);
    if (id) ids.push(id);
  }
  return ids.sort();
}

export function normalizedOrderRowStatus(orderRow) {
  return str(
    orderRow?.status ??
      orderRow?.order_status ??
      orderRow?.orderStatus ??
      orderRow?.Order_Status ??
      "Placed"
  ).toLowerCase();
}

/** Match dashboard revenue rule: fulfilled deliveries only (Placed/Fulfilled/case variants). */
export function isFulfilledOrderStatus(statusNormalized) {
  return str(statusNormalized).toLowerCase() === "fulfilled";
}

export function orderOperationalExcludedFromIndices(orderRow) {
  return normalizedOrderRowStatus(orderRow) === "cancelled";
}

/** Dashboard revenue: fulfilled deliveries only. */
export function orderCountsTowardDashboardRevenue(orderRow) {
  return isFulfilledOrderStatus(normalizedOrderRowStatus(orderRow));
}

/**
 * Core revenue rollups for executive KPIs (Admin dashboard path).
 * @param {{ ordersRaw: object[], orderItemsRaw: object[], todayYmd: string, labNameById?: Map<string,string> }} input
 */
export function computeRevenueMetrics({ ordersRaw, orderItemsRaw, todayYmd, labNameById = new Map() }) {
  const lineTotalByOrderId = buildLineTotalByOrderId(orderItemsRaw);
  let todaysRevenue = 0;
  let totalSoldValue = 0;
  let activeOrdersCount = 0;
  let fulfilledOrdersCount = 0;
  const revenueByLab = new Map();

  for (const o of ordersRaw || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;

    activeOrdersCount += 1;
    const orderDate = str(o.order_date ?? o.orderDate ?? o.created_at ?? "").slice(0, 10);
    const amount = resolveOrderAmount(o, lineTotalByOrderId);
    const labId = normalizeLabIdKey(o.lab_id ?? o.labId);

    if (orderCountsTowardDashboardRevenue(o)) {
      fulfilledOrdersCount += 1;
      totalSoldValue += amount;
      if (orderDate === todayYmd) todaysRevenue += amount;
      if (!labId) continue;
      const prev = revenueByLab.get(labId) || { revenue: 0, labName: labNameById.get(labId) || labId };
      prev.revenue += amount;
      if (!prev.labName) prev.labName = labNameById.get(labId) || labId;
      revenueByLab.set(labId, prev);
    }
  }

  const topLabsByRevenue = Array.from(revenueByLab.entries())
    .map(([labId, v]) => ({
      labId,
      labName: v.labName || labNameById.get(labId) || labId,
      revenue: num(v.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    lineTotalByOrderId,
    todaysRevenue,
    totalSoldValue,
    activeOrdersCount,
    fulfilledOrdersCount,
    revenueByLab,
    topLabsByRevenue,
  };
}

export function buildOrdersByLabDateIndex(ordersRaw, lineTotalByOrderId) {
  const index = new Map();
  for (const o of ordersRaw || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;
    const labId = normalizeLabIdKey(o.lab_id ?? o.labId);
    const orderDate = str(o.order_date ?? o.orderDate ?? o.created_at ?? "").slice(0, 10);
    const orderId = str(o.order_id ?? o.orderId ?? o.id);
    const amount = resolveOrderAmount(o, lineTotalByOrderId);
    if (!labId || !orderDate || amount <= 0) continue;
    const key = `${labId}|${orderDate}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({
      orderId,
      amount,
      createdAt: str(o.created_at ?? o.createdAt ?? ""),
    });
  }
  for (const list of index.values()) {
    list.sort((a, b) => {
      const tb = new Date(b.createdAt || 0).getTime();
      const ta = new Date(a.createdAt || 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
  }
  return index;
}
