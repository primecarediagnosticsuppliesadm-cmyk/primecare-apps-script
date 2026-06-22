import {
  normalizeOrderStatusLabel,
  normalizePaymentStatusLabel,
} from "@/orders/ordersMonitorEngine.js";
import { formatOrderPaymentLabel } from "@/utils/orderTracking.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function orderTimestamp(order) {
  const created = String(order?.createdAt ?? "").trim();
  if (created) {
    const t = new Date(created).getTime();
    if (Number.isFinite(t)) return t;
  }
  const date = String(order?.orderDate ?? "").trim();
  if (date) {
    const t = new Date(`${date.slice(0, 10)}T12:00:00`).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/** True when order payment label indicates unpaid or partially paid work. */
export function isOpenReceivableOrder(order) {
  const status = normalizeOrderStatusLabel(order?.orderStatus).toLowerCase();
  if (status !== "fulfilled") return false;

  const paymentLabel = formatOrderPaymentLabel({
    orderStatus: order?.orderStatus,
    paymentStatus: order?.paymentStatus,
    invoiceStatus: order?.invoiceStatus,
  });
  const pay = normalizePaymentStatusLabel(paymentLabel).toLowerCase();
  return pay === "pending" || pay === "partial" || pay.includes("partial");
}

/** Fulfilled orders that still show payment pending (reference open orders for AR). */
export function selectOpenOrdersForLab(orders) {
  return (orders || [])
    .filter(isOpenReceivableOrder)
    .sort((a, b) => orderTimestamp(b) - orderTimestamp(a));
}

export function sumOpenOrderAmounts(openOrders) {
  return (openOrders || []).reduce((sum, order) => sum + num(order.orderTotal), 0);
}

/** Synthetic reference id for AR balance not tied to an open fulfilled order. */
export const UNALLOCATED_AR_REF_ID = "__unallocated_ar__";

export function computeUnallocatedArAmount(outstandingAmount, openOrders) {
  const outstanding = num(outstandingAmount);
  const openTotal = sumOpenOrderAmounts(openOrders);
  return Math.max(0, outstanding - openTotal);
}

export function sumSelectedOpenOrderAmounts(
  openOrders,
  selectedOrderIds = [],
  outstandingAmount = 0
) {
  const selected = new Set(
    (selectedOrderIds || []).map((id) => String(id || "").trim()).filter(Boolean)
  );
  if (!selected.size) return 0;

  let sum = (openOrders || [])
    .filter((order) => selected.has(String(order.orderId || "").trim()))
    .reduce((total, order) => total + num(order.orderTotal), 0);

  if (selected.has(UNALLOCATED_AR_REF_ID)) {
    sum += computeUnallocatedArAmount(outstandingAmount, openOrders);
  }

  return sum;
}

export function previewCollectionPaymentAmount(amountCollected, selectedRefAmount) {
  const entered = String(amountCollected ?? "").trim();
  if (entered !== "") {
    return num(amountCollected);
  }
  const selectedTotal = num(selectedRefAmount);
  return selectedTotal > 0 ? selectedTotal : 0;
}

export function orderPaymentDisplayLabel(order) {
  return formatOrderPaymentLabel({
    orderStatus: order?.orderStatus,
    paymentStatus: order?.paymentStatus,
    invoiceStatus: order?.invoiceStatus,
  });
}
