import { getOrderDetails } from "@/api/primecareApi";
import { getOrderDetailsRead } from "@/api/primecareSupabaseApi.js";
import { recordPredatorTiming } from "@/predator/predatorTiming.js";
import { labIdKey } from "@/utils/labId.js";
import { orderStatusToVariant } from "@/utils/statusTokens.js";

export const TRACKING_STEPS = [
  { key: "placed", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "dispatched", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

const TERMINAL_STATUSES = new Set(["cancelled", "rejected", "canceled"]);

/**
 * Normalize raw order status strings to tracking pipeline keys.
 */
export function normalizeTrackingStatus(rawStatus) {
  const s = String(rawStatus || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (!s) return "placed";
  if (TERMINAL_STATUSES.has(s)) return "cancelled";
  if (s === "pending" || s === "placed") return "placed";
  if (s === "confirmed") return "confirmed";
  if (s === "packed" || s === "packing") return "packed";
  if (
    s === "dispatched" ||
    s === "dispatch" ||
    s === "out_for_delivery" ||
    s === "out for delivery" ||
    s === "shipped" ||
    s === "in_transit" ||
    s === "in transit"
  ) {
    return "dispatched";
  }
  if (s === "delivered" || s === "fulfilled" || s === "complete" || s === "completed") {
    return "delivered";
  }
  if (s === "processing" || s === "in_progress" || s === "in progress") {
    return "confirmed";
  }
  return "placed";
}

/**
 * Map backend status to active step index (0-based) for progress UI.
 */
export function getTrackingStepIndex(rawStatus) {
  const normalized = normalizeTrackingStatus(rawStatus);
  if (normalized === "cancelled") return -1;
  const rank = {
    placed: 0,
    confirmed: 1,
    packed: 2,
    dispatched: 3,
    delivered: 4,
  };
  return rank[normalized] ?? 0;
}

export function isCancelledStatus(rawStatus) {
  return normalizeTrackingStatus(rawStatus) === "cancelled";
}

/**
 * Build timeline step states for OrderTrackingDrawer.
 */
export function buildTrackingSteps(order, options = {}) {
  const rawStatus = order?.orderStatus;
  const cancelled = isCancelledStatus(rawStatus);
  const activeIndex = cancelled ? -1 : getTrackingStepIndex(rawStatus);

  const placedAt = options.placedAt || order?.createdAt || order?.orderDate || null;
  const updatedAt = options.updatedAt || order?.updatedAt || order?.orderDate || placedAt;

  if (cancelled) {
    return TRACKING_STEPS.map((step, index) => ({
      key: step.key,
      label: step.label,
      state: index === 0 ? "complete" : index === 1 ? "cancelled" : "upcoming",
      timestamp: index === 0 ? placedAt : index === 1 ? updatedAt : null,
    }));
  }

  return TRACKING_STEPS.map((step, index) => {
    let state = "upcoming";
    if (index < activeIndex) {
      state = "complete";
    } else if (index === activeIndex) {
      state = "current";
    }

    let timestamp = null;
    if (index === 0) timestamp = placedAt;
    else if (index === activeIndex) timestamp = updatedAt;
    else if (index === TRACKING_STEPS.length - 1) timestamp = updatedAt;

    return {
      key: step.key,
      label: step.label,
      state,
      timestamp,
    };
  });
}

/**
 * Payment display label for tracking header.
 */
export function formatPaymentState(paymentStatus, invoiceStatus) {
  const pay = String(paymentStatus || "").trim();
  const inv = String(invoiceStatus || "").trim();
  if (pay) return pay;
  if (inv) return inv;
  return "Pending";
}

/**
 * Map getOrderDetailsRead / Apps Script payload to drawer model.
 */
export function mapOrderDetailsPayload(payload) {
  const order = payload?.order || {};
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];

  const orderId = String(order.orderId || order.order_id || "");
  const orderStatus = String(
    order.orderStatus || order.status || order.order_status || "Placed"
  );
  const paymentStatus = String(
    order.paymentStatus || order.payment_status || order.payment_state || ""
  );
  const invoiceStatus = String(order.invoiceStatus || order.invoice_status || "");

  const itemCount = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const orderTotal = Number(
    order.orderTotal ?? order.total_amount ?? order.totalAmount ?? order.order_total ?? 0
  );

  const mappedLines = lines.map((line) => {
    const quantity = Number(line.quantity || 0);
    const lineTotal = Number(
      line.netLineTotal ?? line.lineTotal ?? line.total_price ?? line.totalPrice ?? 0
    );
    const unitPrice = Number(
      line.unitSellingPrice ??
        line.unitPrice ??
        (quantity > 0 && lineTotal ? lineTotal / quantity : 0)
    );
    return {
      orderLineId: line.orderLineId,
      productId: line.productId,
      productName: line.productName || line.productId || "Item",
      quantity,
      unitPrice,
      lineTotal: lineTotal || quantity * unitPrice,
      status: line.status || line.lineStatus || orderStatus,
    };
  });

  return {
    orderId,
    orderDate: order.orderDate || order.order_date || order.date || "",
    createdAt: order.createdAt || order.created_at || "",
    updatedAt: order.updatedAt || order.updated_at || order.orderDate || "",
    labId: order.labId || order.lab_id || "",
    labName: order.labName || "",
    orderStatus,
    paymentStatus,
    invoiceStatus,
    paymentLabel: formatPaymentState(paymentStatus, invoiceStatus),
    orderTotal,
    itemCount,
    notes: order.notes || order.order_notes || "",
    invoiceId: order.invoiceId || order.invoice_id || "",
    lines: mappedLines,
    fulfillmentNote: order.notes || order.fulfillment_note || order.remark || "",
    expectedDispatch: order.expected_dispatch || order.dispatch_date || order.eta || "",
    deliveryStatus: order.delivery_status || order.fulfillment_status || orderStatus,
    contactPerson: order.contactPerson || order.contact_name || "",
    mobileNumber: order.mobileNumber || order.mobile_number || order.phone || "",
  };
}

export function orderStatusChipVariant(rawStatus) {
  return orderStatusToVariant(rawStatus);
}

export function resolveDrawerDetails(orderOrPayload) {
  if (!orderOrPayload) return null;
  if (orderOrPayload.orderId && Array.isArray(orderOrPayload.lines)) {
    return orderOrPayload;
  }
  return mapOrderDetailsPayload(orderOrPayload);
}

/**
 * Lab-scoped order details for tracking drawer (Supabase first, Apps Script fallback).
 */
export async function fetchScopedOrderDetails(orderId, labKey) {
  if (!orderId) throw new Error("Order ID is missing.");

  let payload = null;
  const supRes = await getOrderDetailsRead(orderId);
  if (supRes?.data?.order) {
    payload = supRes.data;
  } else {
    const fallback = await getOrderDetails(orderId);
    const result = fallback?.data || fallback || null;
    if (result?.order) payload = result;
  }

  if (!payload?.order) {
    throw new Error("Unable to load order details right now.");
  }

  const mapped = mapOrderDetailsPayload(payload);
  const orderLabKey = labIdKey(mapped.labId);
  if (labKey && orderLabKey && orderLabKey !== labKey) {
    throw new Error("This order is not available for your lab.");
  }
  return mapped;
}

export function logOrderTrackingEvent(step, detail = {}) {
  recordPredatorTiming({
    module: "Order Tracking",
    step,
    durationMs: 0,
    detail,
  });
}

/**
 * Persist repeat-order cart handoff for Lab Ordering page.
 */
export function prepareLabRepeatOrderHandoff(details, labKey) {
  const cartItems = (details?.lines || [])
    .filter((line) => line.productId)
    .map((line) => ({
      productId: line.productId,
      productName: line.productName,
      quantity: Math.max(1, Number(line.quantity || 1)),
      unitPrice: Number(line.unitPrice || 0),
      category: "",
      stockHealth: "OK",
      currentStock: null,
    }));

  if (!cartItems.length) {
    throw new Error("No reorderable items found on this order.");
  }

  const productQty = {};
  for (const item of cartItems) {
    productQty[item.productId] = item.quantity;
  }

  const draftKey = labKey ? `lab-ordering-cart-draft:${labKey}` : "";
  const handoffKey = labKey ? `lab-ordering-handoff:${labKey}` : "";

  if (draftKey) {
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        cartItems,
        notes: "",
        productQty,
      })
    );
  }
  if (handoffKey) {
    window.localStorage.setItem(
      handoffKey,
      JSON.stringify({
        message: `Order ${details.orderId} loaded into cart.`,
        openCart: true,
        ts: Date.now(),
      })
    );
  }

  logOrderTrackingEvent("order_tracking.repeat_order", {
    orderId: details.orderId,
    lineCount: cartItems.length,
  });

  return { cartItems, orderId: details.orderId };
}