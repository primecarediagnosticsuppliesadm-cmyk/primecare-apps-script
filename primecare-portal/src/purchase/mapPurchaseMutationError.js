function str(value) {
  return String(value ?? "").trim();
}

/**
 * Map purchase mutation failures to business-facing feedback.
 * Does not change database constraints or write semantics.
 * Never surfaces raw PostgreSQL / PostgREST messages as the primary title/message.
 *
 * @param {unknown} errorInput
 * @param {{ action?: string }} [context]
 */
export function mapPurchaseMutationError(errorInput, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const action = str(context.action).toLowerCase();

  if (/supabase is not configured/i.test(message)) {
    return {
      code: "SUPABASE_NOT_CONFIGURED",
      title: "Purchase service unavailable",
      message: "Purchase updates are not available right now. Contact your administrator.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /procurement.*(frozen|freeze)/i.test(message) ||
    /purchase order frozen/i.test(message) ||
    /frozen for this certified hq release/i.test(message)
  ) {
    return {
      code: "PURCHASE_ORDER_FROZEN",
      title: "Purchase Order frozen",
      message: "Procurement writes are frozen for this certified HQ release. Purchase orders cannot be created, edited, cancelled, or received.",
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
      message: "You do not have permission to perform this purchase action.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /open po already exists/i.test(message) ||
    /purchase order already exists/i.test(message) ||
    /duplicate key/i.test(message) ||
    /unique constraint/i.test(message) ||
    (/already exists/i.test(message) && /po|purchase/i.test(message))
  ) {
    return {
      code: "PURCHASE_ORDER_ALREADY_EXISTS",
      title: "Purchase Order already exists",
      message: "An open purchase order already exists for this product, or this purchase order id is already in use.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /cannot receive stock/i.test(message) ||
    /cannot be received/i.test(message) ||
    /already received/i.test(message) ||
    /purchase receipt already/i.test(message) ||
    /only ordered or partially received/i.test(message) ||
    /cannot receive stock for purchase order with status/i.test(message) ||
    (/status/i.test(message) && /received/i.test(message) && /cannot/i.test(message))
  ) {
    return {
      code: "PURCHASE_ORDER_ALREADY_RECEIVED",
      title: "Purchase Order already received",
      message:
        "This purchase order cannot be received. It may already be fully received or is not in an eligible status.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /cannot cancel a purchase order after stock has been received/i.test(message) ||
    /cannot edit product or quantity after stock has been received/i.test(message) ||
    (/cannot (cancel|edit)/i.test(message) && /received/i.test(message))
  ) {
    return {
      code: "PURCHASE_ORDER_ALREADY_RECEIVED",
      title: "Purchase Order already received",
      message: "This purchase order cannot be edited or cancelled after stock has been received.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /supplier unavailable/i.test(message) ||
    /supplier not (found|available)/i.test(message) ||
    /supplier.*(blocked|inactive)/i.test(message)
  ) {
    return {
      code: "SUPPLIER_UNAVAILABLE",
      title: "Supplier unavailable",
      message: "The selected supplier is unavailable. Choose another supplier or leave supplier blank and try again.",
      fieldErrors: { supplier: "Supplier unavailable" },
      suggestedActions: [],
      focusField: "supplier",
      rawErrorForLogging: message,
    };
  }

  if (
    /received quantity.*cannot exceed/i.test(message) ||
    /remaining quantity/i.test(message) ||
    /receivedqty must be greater than zero/i.test(message) ||
    /received quantity must be greater than zero/i.test(message)
  ) {
    return {
      code: "INVALID_RECEIVE_QTY",
      title: "Invalid receive quantity",
      message: /postgres|PGRST|SQLSTATE/i.test(message)
        ? "Received quantity is invalid for this purchase order."
        : message || "Received quantity is invalid for this purchase order.",
      fieldErrors: { receivedQty: "Check remaining quantity" },
      suggestedActions: [],
      focusField: "receivedQty",
      rawErrorForLogging: message,
    };
  }

  if (
    /quantity must be greater than zero/i.test(message) ||
    /unit cost must be greater than zero/i.test(message) ||
    /productid is required/i.test(message) ||
    /product_id is required/i.test(message) ||
    /select a valid product/i.test(message) ||
    /poid is required/i.test(message) ||
    /select or enter a purchase order/i.test(message) ||
    /tenant_id is required/i.test(message) ||
    /tenant context is missing/i.test(message)
  ) {
    return {
      code: "INVALID_REQUEST",
      title: "Invalid purchase request",
      message: /postgres|PGRST|SQLSTATE/i.test(message)
        ? "The purchase request is not valid. Review the form and try again."
        : message || "The purchase request is not valid. Review the form and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/purchase order not found/i.test(message) || (/not found/i.test(message) && /purchase/i.test(message))) {
    return {
      code: "PURCHASE_ORDER_NOT_FOUND",
      title: "Purchase Order not found",
      message: "This purchase order could not be found. Refresh the list and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/cannot (cancel|edit) purchase order with status/i.test(message)) {
    return {
      code: "INVALID_PO_STATUS",
      title: "Purchase Order status not eligible",
      message: /postgres|PGRST|SQLSTATE/i.test(message)
        ? "This purchase order cannot be changed in its current status."
        : message,
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  // Never surface raw Postgres / PostgREST noise as the primary message.
  if (
    /postgres/i.test(message) ||
    /PGRST/i.test(message) ||
    /postgrest/i.test(message) ||
    /SQLSTATE/i.test(message) ||
    /violates .+ constraint/i.test(message) ||
    /relation .+ does not exist/i.test(message)
  ) {
    return {
      code: "UNEXPECTED_PURCHASE_WRITE_FAILURE",
      title: "Unexpected purchase write failure",
      message: "The purchase change could not be saved. Review the purchase order and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/failed to (create|update|cancel|receive|bulk)/i.test(message) || /insert failed/i.test(message)) {
    return {
      code: "UNEXPECTED_PURCHASE_WRITE_FAILURE",
      title: "Unexpected purchase write failure",
      message: "The purchase change could not be saved. Review the purchase order and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  return {
    code: "UNEXPECTED_PURCHASE_WRITE_FAILURE",
    title: "Unexpected purchase write failure",
    message:
      message && !/postgres|PGRST|SQLSTATE|violates/i.test(message)
        ? message
        : "The purchase change could not be saved. Try again.",
    fieldErrors: {},
    suggestedActions: [],
    focusField: null,
    rawErrorForLogging: message,
  };
}
