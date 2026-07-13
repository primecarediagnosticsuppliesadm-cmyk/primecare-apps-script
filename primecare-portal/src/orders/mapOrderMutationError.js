function str(value) {
  return String(value ?? "").trim();
}

/**
 * Map HQ order status mutation failures to business-facing feedback.
 * Does not change database constraints or write semantics.
 */
export function mapOrderMutationError(errorInput, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const nextStatus = str(context.nextStatus);

  if (/supabase is not configured/i.test(message)) {
    return {
      code: "SUPABASE_NOT_CONFIGURED",
      title: "Orders service unavailable",
      message: "Order status updates are not available right now. Contact your administrator.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/frozen for this certified hq release/i.test(message) || /status changes are frozen/i.test(message)) {
    return {
      code: "STATUS_WRITE_FROZEN",
      title: "Order status changes frozen",
      message: "Order status changes are frozen for this certified HQ release.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /permission denied/i.test(message) ||
    /not authorized/i.test(message) ||
    /do not have permission/i.test(message) ||
    /42501/.test(message) ||
    /row-level security/i.test(message) ||
    /rls/i.test(message)
  ) {
    return {
      code: "PERMISSION_DENIED",
      title: "Permission denied",
      message: "You do not have permission to update this order status.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/order not found/i.test(message) || /not found or not visible/i.test(message)) {
    return {
      code: "ORDER_NOT_FOUND",
      title: "Order no longer exists",
      message: "This order could not be found. Refresh the list and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /already fulfilled/i.test(message) ||
    (/fulfilled/i.test(message) && /already/i.test(message)) ||
    (nextStatus && /cannot be fulfilled/i.test(message))
  ) {
    return {
      code: "ORDER_ALREADY_FULFILLED",
      title: "Order already fulfilled",
      message: "This order is already fulfilled or cannot be fulfilled from its current status.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /cannot be cancelled/i.test(message) ||
    (/cancelled/i.test(message) && /cannot/i.test(message) && nextStatus === "Cancelled")
  ) {
    return {
      code: "ORDER_CANNOT_CANCEL",
      title: "Order cannot be cancelled",
      message: "This order cannot be cancelled from its current status.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /insufficient inventory/i.test(message) ||
    /inventory unavailable/i.test(message) ||
    /inventory deduction failed/i.test(message) ||
    /order_out ledger/i.test(message) ||
    /no line items to fulfill/i.test(message)
  ) {
    return {
      code: "INVENTORY_UNAVAILABLE",
      title: "Inventory unavailable",
      message:
        "This order cannot be fulfilled because inventory is insufficient or fulfillment stock validation failed.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/invalid order status/i.test(message) || /status is required/i.test(message) || /order_id is required/i.test(message)) {
    return {
      code: "INVALID_STATUS_REQUEST",
      title: "Invalid status update",
      message: "The requested status update is not valid. Refresh the order and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/supabase order status update is required/i.test(message) || /apps script fallback is disabled/i.test(message)) {
    return {
      code: "LEGACY_WRITE_BLOCKED",
      title: "Order status update blocked",
      message: "This environment requires Supabase for order status updates. Contact your administrator.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/failed to update/i.test(message) || /order status update failed/i.test(message)) {
    return {
      code: "ORDER_WRITE_FAILED",
      title: "Unexpected write failure",
      message: "The order status could not be saved. Review the order and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  return {
    code: "UNEXPECTED_WRITE_FAILURE",
    title: "Unexpected write failure",
    message: message || "The order status could not be updated. Try again.",
    fieldErrors: {},
    suggestedActions: [],
    focusField: null,
    rawErrorForLogging: message,
  };
}
