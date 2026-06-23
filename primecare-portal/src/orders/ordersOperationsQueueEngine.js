import {
  normalizeOrderStatusLabel,
  normalizePaymentStatusLabel,
} from "@/orders/ordersMonitorEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function orderTimestamp(order) {
  const created = str(order.createdAt);
  if (created) {
    const t = new Date(created).getTime();
    if (Number.isFinite(t)) return t;
  }
  const date = str(order.orderDate);
  if (date) {
    const t = new Date(`${date}T12:00:00`).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

export const ORDER_QUEUE_KEYS = {
  AWAITING_FULFILLMENT: "awaiting_fulfillment",
  PENDING_PAYMENT: "pending_payment",
  EXCEPTIONS: "exceptions",
  RECENTLY_FULFILLED: "recently_fulfilled",
};

const FULFILLED_RECENT_DAYS = 14;

export function isAwaitingFulfillment(order) {
  const status = normalizeOrderStatusLabel(order.orderStatus).toLowerCase();
  return status === "placed" || status === "processing";
}

export function isPendingPaymentOrder(order) {
  const status = normalizeOrderStatusLabel(order.orderStatus).toLowerCase();
  if (status === "cancelled") return false;
  const payment = normalizePaymentStatusLabel(order.paymentStatus).toLowerCase();
  return payment === "pending" || payment === "partial";
}

export function isExceptionOrder(order) {
  const status = normalizeOrderStatusLabel(order.orderStatus).toLowerCase();
  return status === "cancelled";
}

export function isRecentlyFulfilledOrder(order, days = FULFILLED_RECENT_DAYS) {
  const status = normalizeOrderStatusLabel(order.orderStatus).toLowerCase();
  if (status !== "fulfilled") return false;
  const ts = orderTimestamp(order);
  if (!ts) return true;
  const cutoff = Date.now() - days * 86400000;
  return ts >= cutoff;
}

/**
 * Action-first order operations queue cards.
 * @param {object[]} orders
 * @param {object} [kpis] - from computeOrdersKpis
 */
export function buildOrdersOperationsQueue(orders = [], kpis = {}) {
  const list = Array.isArray(orders) ? orders : [];
  const awaiting = list.filter(isAwaitingFulfillment);
  const pendingPayment = list.filter(isPendingPaymentOrder);
  const exceptions = list.filter(isExceptionOrder);
  const recentlyFulfilled = list.filter((o) => isRecentlyFulfilledOrder(o));

  return [
    {
      id: ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT,
      label: "Awaiting fulfillment",
      description: "Placed or processing — needs pick/pack/ship",
      count: kpis.placed != null ? num(kpis.placed) + num(kpis.processing) : awaiting.length,
      severity: awaiting.length > 0 ? "attention" : "healthy",
      orderIds: awaiting.map((o) => str(o.orderId)).filter(Boolean),
    },
    {
      id: ORDER_QUEUE_KEYS.PENDING_PAYMENT,
      label: "Pending payment",
      description: "Payment pending or partial — excludes cancelled",
      count: kpis.pendingPayment != null ? num(kpis.pendingPayment) : pendingPayment.length,
      severity: pendingPayment.length > 0 ? "attention" : "healthy",
      orderIds: pendingPayment.map((o) => str(o.orderId)).filter(Boolean),
    },
    {
      id: ORDER_QUEUE_KEYS.EXCEPTIONS,
      label: "Exceptions / cancelled",
      description: "Cancelled orders — audit disputes or re-orders",
      count: kpis.cancelled != null ? num(kpis.cancelled) : exceptions.length,
      severity: exceptions.length > 0 ? "monitor" : "healthy",
      orderIds: exceptions.map((o) => str(o.orderId)).filter(Boolean),
    },
    {
      id: ORDER_QUEUE_KEYS.RECENTLY_FULFILLED,
      label: "Recently fulfilled",
      description: `Fulfilled in the last ${FULFILLED_RECENT_DAYS} days`,
      count: recentlyFulfilled.length,
      severity: recentlyFulfilled.length > 0 ? "healthy" : "monitor",
      orderIds: recentlyFulfilled.map((o) => str(o.orderId)).filter(Boolean),
    },
  ];
}

/**
 * Filter orders for the active queue bucket (applied after standard filters).
 */
export function filterOrdersByQueue(orders, queueKey) {
  const list = Array.isArray(orders) ? orders : [];
  if (!queueKey) return list;

  switch (queueKey) {
    case ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT:
      return list.filter(isAwaitingFulfillment);
    case ORDER_QUEUE_KEYS.PENDING_PAYMENT:
      return list.filter(isPendingPaymentOrder);
    case ORDER_QUEUE_KEYS.EXCEPTIONS:
      return list.filter(isExceptionOrder);
    case ORDER_QUEUE_KEYS.RECENTLY_FULFILLED:
      return list.filter((o) => isRecentlyFulfilledOrder(o));
    default:
      return list;
  }
}

/**
 * Map queue selection to filter state for OrdersPage.
 */
export function queueKeyToFilterPatch(queueKey) {
  switch (queueKey) {
    case ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT:
      return { status: "ALL", paymentStatus: "ALL", sortKey: "payment_pending" };
    case ORDER_QUEUE_KEYS.PENDING_PAYMENT:
      return { status: "ALL", paymentStatus: "Pending", sortKey: "payment_pending" };
    case ORDER_QUEUE_KEYS.EXCEPTIONS:
      return { status: "Cancelled", paymentStatus: "ALL", sortKey: "newest" };
    case ORDER_QUEUE_KEYS.RECENTLY_FULFILLED:
      return { status: "Fulfilled", paymentStatus: "ALL", sortKey: "newest" };
    default:
      return null;
  }
}
