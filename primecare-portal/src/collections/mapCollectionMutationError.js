function str(value) {
  return String(value ?? "").trim();
}

/**
 * Map collection payment / follow-up mutation failures to business-facing feedback.
 * Does not change database constraints or write semantics.
 */
export function mapCollectionMutationError(errorInput, context = {}) {
  const message =
    typeof errorInput === "string"
      ? errorInput
      : str(errorInput?.error || errorInput?.message || errorInput);
  const amountCollected = Number(context.amountCollected ?? 0);
  const isPaymentAttempt = amountCollected > 0;

  if (/supabase is not configured/i.test(message)) {
    return {
      code: "SUPABASE_NOT_CONFIGURED",
      title: "Collections service unavailable",
      message: "Payment recording is not available right now. Contact your administrator.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/lab_id is required/i.test(message)) {
    return {
      code: "LAB_REQUIRED",
      title: "Lab account missing",
      message: "Select a lab collection account before saving.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/amount_received must be > 0/i.test(message)) {
    return {
      code: "AMOUNT_REQUIRED",
      title: "Enter a payment amount",
      message: "Enter an amount greater than zero to record a payment.",
      fieldErrors: { amountCollected: "Amount must be greater than zero." },
      suggestedActions: [],
      focusField: "amountCollected",
      rawErrorForLogging: message,
    };
  }

  if (/tenant_id is required/i.test(message)) {
    return {
      code: "TENANT_REQUIRED",
      title: "Tenant context missing",
      message: "This collection account is missing tenant context. Refresh and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/lab not found in ar_credit_control/i.test(message)) {
    return {
      code: "AR_ROW_MISSING",
      title: "Collection account not found",
      message: "This lab does not have an AR record yet. Refresh the list and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/AR read failed/i.test(message) || /ar_credit_control select/i.test(message)) {
    return {
      code: "AR_READ_FAILED",
      title: "Could not read account balance",
      message: "The outstanding balance could not be loaded. Refresh and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (
    /payment could not be allocated/i.test(message) ||
    /allocation failed/i.test(message) ||
    /invoice allocation failed/i.test(message) ||
    /payment drift/i.test(message)
  ) {
    return {
      code: "ALLOCATION_FAILED",
      title: "Payment could not be allocated",
      message:
        "The payment was not fully applied to the invoice. Review the linked order or invoice status and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/finalize/i.test(message) && /invoice/i.test(message)) {
    return {
      code: "INVOICE_FINALIZE_FAILED",
      title: "Invoice not ready for payment",
      message:
        "The linked invoice could not be finalized for payment. Open the invoice center and confirm it is sent before recording payment.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/enter an amount collected/i.test(message)) {
    return {
      code: "NOTES_OR_AMOUNT_REQUIRED",
      title: "Nothing to save",
      message: "Enter a payment amount or save follow-up notes when Supabase is configured.",
      fieldErrors: {
        amountCollected: "Enter an amount or use the follow-up fields.",
      },
      suggestedActions: [],
      focusField: "amountCollected",
      rawErrorForLogging: message,
    };
  }

  if (/supabase collections write is required/i.test(message)) {
    return {
      code: "LEGACY_WRITE_BLOCKED",
      title: "Payment recording blocked",
      message: "This environment requires Supabase for collection updates. Contact your administrator.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: null,
      rawErrorForLogging: message,
    };
  }

  if (/failed to update collection/i.test(message) || /failed to save collection notes/i.test(message)) {
    return {
      code: "COLLECTION_WRITE_FAILED",
      title: isPaymentAttempt ? "Could not record payment" : "Could not save follow-up",
      message: isPaymentAttempt
        ? "The payment could not be saved. Review the fields and try again."
        : "The follow-up details could not be saved. Review the fields and try again.",
      fieldErrors: {},
      suggestedActions: [],
      focusField: isPaymentAttempt ? "amountCollected" : "nextFollowUp",
      rawErrorForLogging: message,
    };
  }

  return {
    code: "COLLECTION_MUTATION_FAILED",
    title: isPaymentAttempt ? "Could not record payment" : "Could not save follow-up",
    message: isPaymentAttempt
      ? "Something went wrong while recording this payment. Review the fields and try again."
      : "Something went wrong while saving follow-up details. Review the fields and try again.",
    fieldErrors: {},
    suggestedActions: [],
    focusField: isPaymentAttempt ? "amountCollected" : null,
    rawErrorForLogging: message,
  };
}
