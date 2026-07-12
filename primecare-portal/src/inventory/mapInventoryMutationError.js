function str(value) {
  return String(value ?? "").trim();
}

/**
 * Map inventory-adjacent mutation failures to business-facing feedback.
 * Does not change database constraints or write semantics.
 *
 * @param {unknown} errorInput
 * @param {{ action?: string }} [context]
 */
export function mapInventoryMutationError(errorInput, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const action = str(context.action).toLowerCase();

  if (/supabase is not configured/i.test(message)) {
    return {
      code: "SUPABASE_NOT_CONFIGURED",
      title: "Inventory service unavailable",
      message: "Inventory updates are not available right now. Contact your administrator.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /catalog.*(frozen|freeze)/i.test(message) ||
    /procurement.*(frozen|freeze)/i.test(message) ||
    /frozen for this certified hq release/i.test(message)
  ) {
    return {
      code: "WRITE_FROZEN",
      title: "Inventory writes frozen",
      message: "Catalog or procurement writes are frozen for this certified HQ release.",
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
      message: "You do not have permission to perform this inventory action.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /product already exists/i.test(message) ||
    /sku already exists/i.test(message) ||
    /duplicate key/i.test(message) ||
    /unique constraint/i.test(message)
  ) {
    return {
      code: "SKU_ALREADY_EXISTS",
      title: "SKU already exists",
      message: "A product with this SKU already exists for this tenant. Use a different SKU or edit the existing product.",
      fieldErrors: { productId: "SKU must be unique" },
      suggestedActions: [],
      focusField: "productId",
      rawErrorForLogging: message,
    };
  }

  if (
    /product not found/i.test(message) ||
    /sku not found/i.test(message) ||
    (/not found/i.test(message) && /product/i.test(message))
  ) {
    return {
      code: "SKU_NOT_FOUND",
      title: "SKU not found",
      message: "This SKU could not be found. Refresh the catalog and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /already inactive/i.test(message) ||
    /already disabled/i.test(message) ||
    (/disabled/i.test(message) && /sku|product/i.test(message)) ||
    (action === "disable" && /already/i.test(message))
  ) {
    return {
      code: "SKU_DISABLED",
      title: "SKU disabled",
      message: "This SKU is already disabled or cannot be disabled from its current state.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /already active/i.test(message) ||
    /already enabled/i.test(message) ||
    (action === "enable" && /already/i.test(message))
  ) {
    return {
      code: "SKU_ALREADY_ENABLED",
      title: "SKU already enabled",
      message: "This SKU is already enabled.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /negative/i.test(message) ||
    (/current_stock/i.test(message) && /check/i.test(message)) ||
    /stock cannot be less than/i.test(message) ||
    /violates check constraint.*stock/i.test(message)
  ) {
    return {
      code: "STOCK_CANNOT_BE_NEGATIVE",
      title: "Stock cannot be negative",
      message: "This action would make stock negative. Review quantities and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /opening stock already/i.test(message) ||
    /opening.*(initialized|exists)/i.test(message) ||
    /OPENING-/i.test(message) && /already/i.test(message)
  ) {
    return {
      code: "OPENING_STOCK_ALREADY_INITIALIZED",
      title: "Opening stock already initialized",
      message: "Opening stock for this SKU has already been initialized. Receive additional stock via Purchase Orders.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: "openingStock",
      rawErrorForLogging: message,
    };
  }

  if (
    /cannot receive stock/i.test(message) ||
    /cannot be received/i.test(message) ||
    /already received/i.test(message) ||
    /purchase receipt already/i.test(message) ||
    /only ordered or partially received/i.test(message) ||
    (/status/i.test(message) && /received/i.test(message) && /cannot/i.test(message))
  ) {
    return {
      code: "PURCHASE_RECEIPT_ALREADY_PROCESSED",
      title: "Purchase receipt already processed",
      message:
        "This purchase order cannot be received. It may already be fully received or is not in an eligible status.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
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
      message: message || "Received quantity is invalid for this purchase order.",
      fieldErrors: { receivedQty: "Check remaining quantity" },
      suggestedActions: [],
      focusField: "receivedQty",
      rawErrorForLogging: message,
    };
  }

  if (/tenant context is missing/i.test(message) || /tenant_id is required/i.test(message)) {
    return {
      code: "TENANT_REQUIRED",
      title: "Tenant context missing",
      message: "Tenant context is missing. Re-login and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /must be a non-negative number/i.test(message) ||
    /product_id is required/i.test(message) ||
    /product_name is required/i.test(message) ||
    /poid is required/i.test(message) ||
    /select or enter a purchase order/i.test(message) ||
    /select a valid product/i.test(message)
  ) {
    return {
      code: "INVALID_REQUEST",
      title: "Invalid inventory request",
      message: message || "The inventory request is not valid. Review the form and try again.",
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
      code: "UNEXPECTED_INVENTORY_WRITE_FAILURE",
      title: "Unexpected inventory write failure",
      message: "The inventory change could not be saved. Review the SKU or purchase order and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/failed to (save|create|update|receive|enable|disable)/i.test(message) || /insert failed/i.test(message)) {
    return {
      code: "UNEXPECTED_INVENTORY_WRITE_FAILURE",
      title: "Unexpected inventory write failure",
      message: "The inventory change could not be saved. Review the SKU or purchase order and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  return {
    code: "UNEXPECTED_INVENTORY_WRITE_FAILURE",
    title: "Unexpected inventory write failure",
    message:
      message && !/postgres|PGRST|SQLSTATE|violates/i.test(message)
        ? message
        : "The inventory change could not be saved. Try again.",
    fieldErrors: {},
    suggestedActions: [],
    focusField: null,
    rawErrorForLogging: message,
  };
}
