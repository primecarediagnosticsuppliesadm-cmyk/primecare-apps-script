/**
 * Delivery charge policy engine — pure functions (Phase 3A operational only).
 */

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round(num(n) * 100) / 100;
}

export const DEFAULT_DELIVERY_POLICY = {
  standardDeliveryCharge: 150,
  freeDeliveryThreshold: 5000,
  currency: "INR",
};

export const DELIVERY_METHOD_INTENT = {
  DELIVERY: "delivery",
  PICKUP: "customer_pickup",
  UNKNOWN: "unknown",
};

export const DELIVERY_CHARGE_REASON = {
  HQ_OVERRIDE: "hq_override",
  CUSTOMER_PICKUP: "customer_pickup",
  L1B_CONTRACT: "l1b_contract",
  FREE_THRESHOLD: "free_threshold",
  STANDARD: "standard",
};

export const DELIVERY_CHARGE_STATUS = {
  QUOTED: "quoted",
  WAIVED: "waived",
  FINALIZED: "finalized",
};

export const DELIVERY_CHARGE_REASON_LABELS = {
  [DELIVERY_CHARGE_REASON.HQ_OVERRIDE]: "HQ override",
  [DELIVERY_CHARGE_REASON.CUSTOMER_PICKUP]: "Customer pickup",
  [DELIVERY_CHARGE_REASON.L1B_CONTRACT]: "L1B / Hybrid contract",
  [DELIVERY_CHARGE_REASON.FREE_THRESHOLD]: "Free delivery threshold",
  [DELIVERY_CHARGE_REASON.STANDARD]: "Standard delivery charge",
};

export function deliveryChargeReasonLabel(reason) {
  const key = str(reason).toLowerCase();
  return DELIVERY_CHARGE_REASON_LABELS[key] || reason || "—";
}

export function normalizeDeliveryPolicy(row = {}) {
  return {
    standardDeliveryCharge: num(
      row.standard_delivery_charge ?? row.standardDeliveryCharge ?? DEFAULT_DELIVERY_POLICY.standardDeliveryCharge
    ),
    freeDeliveryThreshold: num(
      row.free_delivery_threshold ?? row.freeDeliveryThreshold ?? DEFAULT_DELIVERY_POLICY.freeDeliveryThreshold
    ),
    currency: str(row.currency) || DEFAULT_DELIVERY_POLICY.currency,
    effectiveFrom: str(row.effective_from ?? row.effectiveFrom) || null,
    isActive: row.is_active ?? row.isActive ?? true,
  };
}

/**
 * Compute operational delivery charge quote.
 * Priority: HQ override → customer pickup → L1B/Hybrid → free threshold → standard.
 */
export function computeDeliveryChargeQuote({
  merchandiseSubtotal = 0,
  policy = DEFAULT_DELIVERY_POLICY,
  deliveryMethodIntent = DELIVERY_METHOD_INTENT.UNKNOWN,
  hasActiveL1bOrHybridContract = false,
  hqOverrideAmount = null,
  hasHqOverride = false,
} = {}) {
  const subtotal = roundMoney(merchandiseSubtotal);
  const normalizedPolicy = normalizeDeliveryPolicy(policy);
  const method = str(deliveryMethodIntent).toLowerCase() || DELIVERY_METHOD_INTENT.UNKNOWN;

  const snapshot = {
    merchandiseSubtotal: subtotal,
    policy: normalizedPolicy,
    deliveryMethodIntent: method,
    hasActiveL1bOrHybridContract: Boolean(hasActiveL1bOrHybridContract),
    hasHqOverride: Boolean(hasHqOverride),
    hqOverrideAmount: hasHqOverride ? roundMoney(hqOverrideAmount) : null,
    computedAt: new Date().toISOString(),
  };

  if (hasHqOverride && hqOverrideAmount != null && hqOverrideAmount !== "") {
    const amount = roundMoney(hqOverrideAmount);
    return {
      amount,
      reason: DELIVERY_CHARGE_REASON.HQ_OVERRIDE,
      status: amount <= 0 ? DELIVERY_CHARGE_STATUS.WAIVED : DELIVERY_CHARGE_STATUS.QUOTED,
      snapshot,
    };
  }

  if (method === DELIVERY_METHOD_INTENT.PICKUP) {
    return {
      amount: 0,
      reason: DELIVERY_CHARGE_REASON.CUSTOMER_PICKUP,
      status: DELIVERY_CHARGE_STATUS.WAIVED,
      snapshot,
    };
  }

  if (hasActiveL1bOrHybridContract) {
    return {
      amount: 0,
      reason: DELIVERY_CHARGE_REASON.L1B_CONTRACT,
      status: DELIVERY_CHARGE_STATUS.WAIVED,
      snapshot,
    };
  }

  const threshold = num(normalizedPolicy.freeDeliveryThreshold);
  if (threshold > 0 && subtotal >= threshold) {
    return {
      amount: 0,
      reason: DELIVERY_CHARGE_REASON.FREE_THRESHOLD,
      status: DELIVERY_CHARGE_STATUS.WAIVED,
      snapshot,
    };
  }

  const amount = roundMoney(normalizedPolicy.standardDeliveryCharge);
  return {
    amount,
    reason: DELIVERY_CHARGE_REASON.STANDARD,
    status: DELIVERY_CHARGE_STATUS.QUOTED,
    snapshot,
  };
}

export function mapOrderDeliveryFields(row = {}) {
  if (!row) return null;
  const hasOverride = Boolean(str(row.delivery_charge_override_at ?? row.deliveryChargeOverrideAt));
  return {
    merchandiseSubtotal: num(row.merchandise_subtotal ?? row.merchandiseSubtotal),
    deliveryChargeAmount: num(row.delivery_charge_amount ?? row.deliveryChargeAmount),
    deliveryChargeReason: str(row.delivery_charge_reason ?? row.deliveryChargeReason),
    deliveryMethodIntent: str(row.delivery_method_intent ?? row.deliveryMethodIntent),
    deliveryPolicySnapshot: row.delivery_policy_snapshot ?? row.deliveryPolicySnapshot ?? null,
    deliveryChargeStatus: str(row.delivery_charge_status ?? row.deliveryChargeStatus),
    overrideAmount: hasOverride
      ? num(row.delivery_charge_override_amount ?? row.deliveryChargeOverrideAmount)
      : null,
    overrideReason: str(row.delivery_charge_override_reason ?? row.deliveryChargeOverrideReason),
    overrideBy: str(row.delivery_charge_override_by ?? row.deliveryChargeOverrideBy),
    overrideAt: str(row.delivery_charge_override_at ?? row.deliveryChargeOverrideAt),
    hasHqOverride: hasOverride,
  };
}

/** HQ may override delivery charge only before invoice is customer-facing / sent. */
export function canEditDeliveryChargeOverride(invoice = {}) {
  if (!invoice || !str(invoice.id ?? invoice.invoice_id)) return true;
  const raw = str(invoice.status ?? invoice.rawStatus).toLowerCase();
  if (["sent", "partially_paid", "paid", "cancelled"].includes(raw)) return false;
  const sentAt = str(invoice.sent_at ?? invoice.sentAt ?? invoice.pdf_generated_at ?? invoice.pdfGeneratedAt);
  const hasPdf = Boolean(str(invoice.pdf_storage_path ?? invoice.pdfStoragePath));
  if (sentAt || hasPdf) return false;
  return true;
}

export function computeEstimatedDeliveryRevenue(shipments = []) {
  return (shipments || []).reduce(
    (sum, row) => sum + num(row.deliveryChargeAmount ?? row.delivery_charge_amount),
    0
  );
}
