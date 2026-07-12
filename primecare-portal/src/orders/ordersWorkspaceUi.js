/**
 * Orders workspace presentation helpers (Sprint 1C).
 * No queue math, routing, or write-path changes.
 */

function str(value) {
  return String(value ?? "").trim();
}

/**
 * One-line expected action for the selected order (discoverability).
 */
export function getOrdersExpectedActionCopy({
  cancelled = false,
  fulfilled = false,
  orderStatus = "",
} = {}) {
  if (cancelled) {
    return {
      action: "No fulfillment action",
      reason: "This order is cancelled and will not be fulfilled.",
    };
  }
  if (fulfilled) {
    return {
      action: "Review payment and logistics",
      reason: "Fulfillment is complete — use invoice, payment, or shipment links as needed.",
    };
  }
  const status = str(orderStatus).toLowerCase();
  if (status === "processing") {
    return {
      action: "Mark Fulfilled when ready",
      reason: "Order is in the fulfillment pipeline.",
    };
  }
  return {
    action: "Mark Processing or Fulfilled",
    reason: "Order is awaiting HQ fulfillment action.",
  };
}

export const ORDERS_WORKSPACE_PRIMARY_QUESTION = "What order work needs my attention?";
