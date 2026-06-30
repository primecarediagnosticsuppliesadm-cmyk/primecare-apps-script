/**
 * Delivery charge policy reads/writes — operational only (Phase 3A; no finance side effects).
 */
import { supabase } from "@/api/supabaseClient.js";
import { logSupabaseFeatureSource } from "@/utils/migrationTrace.js";
import { hqDebugWarn } from "@/utils/hqDebugLog.js";
import { labIdKey } from "@/utils/labId.js";
import {
  canEditDeliveryChargeOverride,
  computeDeliveryChargeQuote,
  DELIVERY_METHOD_INTENT,
  mapOrderDeliveryFields,
  normalizeDeliveryPolicy,
} from "@/logistics/deliveryChargeEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingPolicyTableError(error) {
  const msg = str(error?.message).toLowerCase();
  return msg.includes("tenant_delivery_policy") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

function isMissingOrderColumnError(error) {
  const msg = str(error?.message).toLowerCase();
  return msg.includes("delivery_charge") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

const L1B_CONTRACT_TYPES = ["L1B Reagent Rental", "Hybrid"];

export async function getTenantDeliveryPolicyRead(tenantId) {
  if (!supabase) {
    return { success: false, error: "Supabase not configured", policy: normalizeDeliveryPolicy({}) };
  }
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", policy: normalizeDeliveryPolicy({}) };

  logSupabaseFeatureSource("DeliveryCharge.getTenantDeliveryPolicyRead", { table: "tenant_delivery_policy" });
  const { data, error } = await supabase
    .from("tenant_delivery_policy")
    .select("*")
    .eq("tenant_id", tid)
    .maybeSingle();

  if (error) {
    if (isMissingPolicyTableError(error)) {
      return { success: true, policy: normalizeDeliveryPolicy({}), warning: "tenant_delivery_policy not deployed" };
    }
    return { success: false, error: error.message, policy: normalizeDeliveryPolicy({}) };
  }

  return {
    success: true,
    policy: normalizeDeliveryPolicy(data || {}),
    row: data,
    error: null,
  };
}

export async function upsertTenantDeliveryPolicyWrite({
  tenantId,
  standardDeliveryCharge,
  freeDeliveryThreshold,
  currency = "INR",
  actorId = "",
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", data: null };

  const row = {
    tenant_id: tid,
    standard_delivery_charge: roundMoney(standardDeliveryCharge),
    free_delivery_threshold: roundMoney(freeDeliveryThreshold),
    currency: str(currency) || "INR",
    effective_from: new Date().toISOString().slice(0, 10),
    is_active: true,
    updated_by: str(actorId) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("tenant_delivery_policy")
    .upsert(row, { onConflict: "tenant_id" })
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: normalizeDeliveryPolicy(data), error: null };
}

function roundMoney(n) {
  return Math.round(num(n) * 100) / 100;
}

export async function hasLabL1bDeliveryBenefitRead(tenantId, labId) {
  if (!supabase || !tenantId || !labId) return { success: true, hasBenefit: false };
  const tid = str(tenantId);
  const lid = labIdKey(labId);
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("lab_contracts")
    .select("id,contract_type,status,start_date,end_date")
    .eq("distributor_id", tid)
    .eq("lab_id", lid)
    .eq("status", "Active")
    .in("contract_type", L1B_CONTRACT_TYPES)
    .lte("start_date", today)
    .gte("end_date", today)
    .limit(1);

  if (error) {
    const msg = str(error.message).toLowerCase();
    if (msg.includes("lab_contracts") && msg.includes("does not exist")) {
      return { success: true, hasBenefit: false, warning: "lab_contracts not deployed" };
    }
    return { success: false, error: error.message, hasBenefit: false };
  }

  return { success: true, hasBenefit: Array.isArray(data) && data.length > 0 };
}

export async function buildDeliveryQuoteForLabOrder({
  tenantId,
  labId,
  merchandiseSubtotal = 0,
  deliveryMethodIntent = DELIVERY_METHOD_INTENT.UNKNOWN,
  orderRow = null,
} = {}) {
  const policyRes = await getTenantDeliveryPolicyRead(tenantId);
  const l1bRes = await hasLabL1bDeliveryBenefitRead(tenantId, labId);
  const mapped = orderRow ? mapOrderDeliveryFields(orderRow) : null;

  const quote = computeDeliveryChargeQuote({
    merchandiseSubtotal,
    policy: policyRes.policy,
    deliveryMethodIntent,
    hasActiveL1bOrHybridContract: Boolean(l1bRes.hasBenefit),
    hasHqOverride: Boolean(mapped?.hasHqOverride),
    hqOverrideAmount: mapped?.hasHqOverride ? mapped.overrideAmount : null,
  });

  return { success: true, quote, policy: policyRes.policy };
}

function orderDeliveryPatchFromQuote(quote, { merchandiseSubtotal, deliveryMethodIntent }) {
  return {
    merchandise_subtotal: roundMoney(merchandiseSubtotal),
    delivery_charge_amount: roundMoney(quote.amount),
    delivery_charge_reason: quote.reason,
    delivery_method_intent: str(deliveryMethodIntent) || DELIVERY_METHOD_INTENT.UNKNOWN,
    delivery_policy_snapshot: quote.snapshot,
    delivery_charge_status: quote.status,
    updated_at: new Date().toISOString(),
  };
}

export async function persistOrderDeliverySnapshotWrite({
  tenantId,
  orderId,
  labId,
  merchandiseSubtotal = 0,
  deliveryMethodIntent = DELIVERY_METHOD_INTENT.DELIVERY,
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const tid = str(tenantId);
  const oid = str(orderId);
  if (!tid || !oid) return { success: false, error: "tenantId and orderId required", data: null };

  const { data: orderRow, error: readErr } = await supabase
    .from("orders")
    .select(
      "order_id,merchandise_subtotal,delivery_charge_override_amount,delivery_charge_override_at,delivery_charge_override_reason,delivery_method_intent"
    )
    .eq("tenant_id", tid)
    .eq("order_id", oid)
    .maybeSingle();

  if (readErr && !isMissingOrderColumnError(readErr)) {
    return { success: false, error: readErr.message, data: null };
  }
  if (isMissingOrderColumnError(readErr)) {
    return { success: false, skipped: true, error: readErr.message, data: null };
  }

  const mapped = mapOrderDeliveryFields(orderRow || {});
  const intent = str(deliveryMethodIntent) || mapped.deliveryMethodIntent || DELIVERY_METHOD_INTENT.DELIVERY;
  const subtotal = merchandiseSubtotal > 0 ? merchandiseSubtotal : num(mapped.merchandiseSubtotal);

  const { quote } = await buildDeliveryQuoteForLabOrder({
    tenantId: tid,
    labId,
    merchandiseSubtotal: subtotal,
    deliveryMethodIntent: intent,
    orderRow,
  });

  const patch = orderDeliveryPatchFromQuote(quote, {
    merchandiseSubtotal: subtotal,
    deliveryMethodIntent: intent,
  });

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("tenant_id", tid)
    .eq("order_id", oid)
    .select()
    .single();

  if (error) {
    if (isMissingOrderColumnError(error)) {
      return { success: false, skipped: true, error: error.message, data: null };
    }
    return { success: false, error: error.message, data: null };
  }

  return { success: true, data: mapOrderDeliveryFields(data), quote, error: null };
}

export async function getOrderDeliverySnapshotRead({ tenantId, orderId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", delivery: null };
  const tid = str(tenantId);
  const oid = str(orderId);
  if (!tid || !oid) return { success: false, error: "tenantId and orderId required", delivery: null };

  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_id,lab_id,merchandise_subtotal,delivery_charge_amount,delivery_charge_reason,delivery_method_intent,delivery_policy_snapshot,delivery_charge_status,delivery_charge_override_amount,delivery_charge_override_reason,delivery_charge_override_by,delivery_charge_override_at,invoice_id"
    )
    .eq("tenant_id", tid)
    .eq("order_id", oid)
    .maybeSingle();

  if (error) {
    if (isMissingOrderColumnError(error)) return { success: true, delivery: null, warning: error.message };
    return { success: false, error: error.message, delivery: null };
  }

  return { success: true, delivery: mapOrderDeliveryFields(data), order: data, error: null };
}

export async function getOrderInvoiceForDeliveryOverrideRead({ tenantId, orderId, invoiceId } = {}) {
  if (!supabase) return { success: true, invoice: null };
  const tid = str(tenantId);
  let query = supabase
    .from("invoices")
    .select("id,status,sent_at,pdf_storage_path,order_id")
    .eq("tenant_id", tid);

  if (str(invoiceId)) {
    query = query.eq("id", str(invoiceId));
  } else if (str(orderId)) {
    query = query.eq("order_id", str(orderId));
  } else {
    return { success: true, invoice: null };
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { success: false, error: error.message, invoice: null };
  return { success: true, invoice: data };
}

export async function applyOrderDeliveryOverrideWrite({
  tenantId,
  orderId,
  labId,
  overrideAmount,
  overrideReason,
  actorId = "",
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const tid = str(tenantId);
  const oid = str(orderId);
  const reason = str(overrideReason);
  if (!tid || !oid) return { success: false, error: "tenantId and orderId required", data: null };
  if (!reason) return { success: false, error: "Override reason is required", data: null };
  if (overrideAmount == null || overrideAmount === "") {
    return { success: false, error: "Override amount is required", data: null };
  }

  const orderRes = await getOrderDeliverySnapshotRead({ tenantId: tid, orderId: oid });
  if (!orderRes.success) return { success: false, error: orderRes.error, data: null };

  const invRes = await getOrderInvoiceForDeliveryOverrideRead({
    tenantId: tid,
    orderId: oid,
    invoiceId: orderRes.order?.invoice_id,
  });
  if (!invRes.success) return { success: false, error: invRes.error, data: null };
  if (!canEditDeliveryChargeOverride(invRes.invoice || {})) {
    return {
      success: false,
      error: "Delivery charge cannot be overridden after the invoice has been sent",
      data: null,
    };
  }

  const subtotal =
    num(orderRes.delivery?.merchandiseSubtotal) > 0
      ? num(orderRes.delivery.merchandiseSubtotal)
      : num(orderRes.order?.total_amount);

  const policyRes = await getTenantDeliveryPolicyRead(tid);
  const l1bRes = await hasLabL1bDeliveryBenefitRead(tid, labId || orderRes.order?.lab_id);
  const amount = roundMoney(overrideAmount);

  const quote = computeDeliveryChargeQuote({
    merchandiseSubtotal: subtotal,
    policy: policyRes.policy,
    deliveryMethodIntent: orderRes.delivery?.deliveryMethodIntent || DELIVERY_METHOD_INTENT.UNKNOWN,
    hasActiveL1bOrHybridContract: Boolean(l1bRes.hasBenefit),
    hasHqOverride: true,
    hqOverrideAmount: amount,
  });

  const now = new Date().toISOString();
  const patch = {
    ...orderDeliveryPatchFromQuote(quote, {
      merchandiseSubtotal: subtotal,
      deliveryMethodIntent: orderRes.delivery?.deliveryMethodIntent || DELIVERY_METHOD_INTENT.UNKNOWN,
    }),
    delivery_charge_override_amount: amount,
    delivery_charge_override_reason: reason,
    delivery_charge_override_by: str(actorId) || null,
    delivery_charge_override_at: now,
  };

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("tenant_id", tid)
    .eq("order_id", oid)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };

  await syncShipmentDeliveryMirrorWrite({
    tenantId: tid,
    orderId: oid,
    deliveryChargeAmount: quote.amount,
    deliveryChargeReason: quote.reason,
  });

  return { success: true, data: mapOrderDeliveryFields(data), quote, error: null };
}

export async function syncShipmentDeliveryMirrorWrite({
  tenantId,
  orderId,
  deliveryChargeAmount = 0,
  deliveryChargeReason = "",
} = {}) {
  if (!supabase) return { success: false, skipped: true };
  const tid = str(tenantId);
  const oid = str(orderId);
  if (!tid || !oid) return { success: false, error: "tenantId and orderId required" };

  const { error } = await supabase
    .from("order_shipments")
    .update({
      delivery_charge_amount: roundMoney(deliveryChargeAmount),
      delivery_charge_reason: str(deliveryChargeReason) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tid)
    .eq("order_id", oid);

  if (error) {
    hqDebugWarn("[syncShipmentDeliveryMirrorWrite]", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function reconcileDeliveryChargeForShipmentWrite({
  tenantId,
  orderId,
  labId,
  deliveryMethod,
} = {}) {
  if (!supabase) return { success: false, skipped: true };
  const tid = str(tenantId);
  const oid = str(orderId);
  if (!tid || !oid) return { success: false, error: "tenantId and orderId required" };

  const orderRes = await getOrderDeliverySnapshotRead({ tenantId: tid, orderId: oid });
  if (!orderRes.success || !orderRes.delivery) return { success: false, error: orderRes.error };

  if (orderRes.delivery.hasHqOverride) {
    return { success: true, skipped: true, data: orderRes.delivery };
  }

  const method = str(deliveryMethod).toLowerCase();
  const intent =
    method === DELIVERY_METHOD_INTENT.PICKUP
      ? DELIVERY_METHOD_INTENT.PICKUP
      : orderRes.delivery.deliveryMethodIntent || DELIVERY_METHOD_INTENT.DELIVERY;

  const subtotal =
    num(orderRes.delivery.merchandiseSubtotal) > 0
      ? num(orderRes.delivery.merchandiseSubtotal)
      : num(orderRes.order?.total_amount);

  const { quote } = await buildDeliveryQuoteForLabOrder({
    tenantId: tid,
    labId: labId || orderRes.order?.lab_id,
    merchandiseSubtotal: subtotal,
    deliveryMethodIntent: intent,
    orderRow: orderRes.order,
  });

  const patch = orderDeliveryPatchFromQuote(quote, {
    merchandiseSubtotal: subtotal,
    deliveryMethodIntent: intent,
  });

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("tenant_id", tid)
    .eq("order_id", oid)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await syncShipmentDeliveryMirrorWrite({
    tenantId: tid,
    orderId: oid,
    deliveryChargeAmount: quote.amount,
    deliveryChargeReason: quote.reason,
  });

  return { success: true, data: mapOrderDeliveryFields(data), quote };
}
