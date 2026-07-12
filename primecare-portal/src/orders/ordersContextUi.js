import { ORDER_QUEUE_KEYS } from "@/orders/ordersOperationsQueueEngine.js";

function str(value) {
  return String(value ?? "").trim();
}

const QUEUE_LABELS = {
  [ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT]: "Awaiting Fulfillment",
  [ORDER_QUEUE_KEYS.PENDING_PAYMENT]: "Pending Payment",
  [ORDER_QUEUE_KEYS.EXCEPTIONS]: "Exceptions / Cancelled",
  [ORDER_QUEUE_KEYS.RECENTLY_FULFILLED]: "Recently Fulfilled",
};

export function ordersQueueDisplayLabel(queueKey = "") {
  const key = str(queueKey);
  return QUEUE_LABELS[key] || key || "";
}

/**
 * Compact context strip parts for HQ Orders orientation.
 */
export function buildOrdersContextParts({
  activeQueueKey = "",
  selectedOrderId = "",
  selectedLabName = "",
  searchQuery = "",
  freezeActive = false,
  focusOrderId = "",
} = {}) {
  const parts = [];
  const queueLabel = ordersQueueDisplayLabel(activeQueueKey);
  if (queueLabel) parts.push(queueLabel);
  const orderId = str(selectedOrderId) || str(focusOrderId);
  if (orderId) parts.push(orderId);
  if (str(selectedLabName)) parts.push(str(selectedLabName));
  if (str(searchQuery)) parts.push(`Search: “${str(searchQuery)}”`);
  if (freezeActive) parts.push("Status writes frozen");
  return parts;
}

function hasActiveListFilters({
  search = "",
  status = "ALL",
  paymentStatus = "ALL",
  labFilter = "ALL",
  dateFrom = "",
  dateTo = "",
  activeQueueKey = "",
} = {}) {
  return Boolean(
    str(search) ||
      (str(status) && status !== "ALL") ||
      (str(paymentStatus) && paymentStatus !== "ALL") ||
      (str(labFilter) && labFilter !== "ALL") ||
      str(dateFrom) ||
      str(dateTo) ||
      str(activeQueueKey)
  );
}

/**
 * Differentiated empty-state copy for the orders list.
 */
export function buildOrdersListEmptyCopy(options = {}) {
  const {
    ordersLength = 0,
    search = "",
    status = "ALL",
    paymentStatus = "ALL",
    labFilter = "ALL",
    dateFrom = "",
    dateTo = "",
    activeQueueKey = "",
    readFailed = false,
  } = options;

  if (readFailed) {
    return {
      code: "READ_FAILED",
      title: "Orders could not be loaded",
      message: "Check the error banner above, then retry.",
      action: "retry",
      actionLabel: "Retry load",
    };
  }

  if (Number(ordersLength) === 0) {
    return {
      code: "NO_ORDERS",
      title: "No orders exist",
      message: "No orders are visible for your current tenant scope.",
      action: "refresh",
      actionLabel: "Refresh",
    };
  }

  if (str(activeQueueKey)) {
    return {
      code: "QUEUE_EMPTY",
      title: "No orders need action in this queue",
      message: `${ordersQueueDisplayLabel(activeQueueKey) || "This queue"} has no matching orders right now.`,
      action: "clear_queue",
      actionLabel: "Return to Queue",
    };
  }

  if (str(search)) {
    return {
      code: "SEARCH_EMPTY",
      title: "No orders match search",
      message: `Nothing matched “${str(search)}”. Try a different order ID or lab name.`,
      action: "clear_search",
      actionLabel: "Clear Search",
    };
  }

  if (
    hasActiveListFilters({
      search,
      status,
      paymentStatus,
      labFilter,
      dateFrom,
      dateTo,
      activeQueueKey,
    })
  ) {
    return {
      code: "FILTER_EMPTY",
      title: "No orders match filters",
      message: "Adjust status, payment, lab, or date filters to broaden results.",
      action: "clear_filters",
      actionLabel: "Clear Filters",
    };
  }

  return {
    code: "EMPTY",
    title: "No orders to show",
    message: "Refresh the list or adjust your scope.",
    action: "refresh",
    actionLabel: "Refresh",
  };
}

/**
 * Copy when a focused/selected order exists but is outside the current filter set.
 */
export function buildFocusedOrderOutsideFiltersCopy({ orderId = "", reason = "filters" } = {}) {
  const id = str(orderId) || "This order";
  return {
    code: "FOCUS_OUTSIDE_FILTERS",
    title: "Focused order is outside current filters",
    message:
      reason === "deep_link"
        ? `${id} is selected from a deep link but is hidden by the current queue or filters.`
        : `${id} stays selected but is hidden by the current queue or filters.`,
    clearLabel: "Clear Filters",
    queueLabel: "Return to Queue",
  };
}
