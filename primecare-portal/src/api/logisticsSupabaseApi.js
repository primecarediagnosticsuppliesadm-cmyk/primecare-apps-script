/**
 * Logistics & Delivery — operational shipment APIs (no finance side effects).
 */
import { supabase } from "@/api/supabaseClient.js";
import { logSupabaseFeatureSource } from "@/utils/migrationTrace.js";
import { hqDebugLog, hqDebugWarn } from "@/utils/hqDebugLog.js";
import {
  buildShipmentIdForOrder,
  canTransitionShipmentStatus,
  mapShipmentEventRow,
  mapShipmentRow,
  SHIPMENT_STATUS,
} from "@/logistics/logisticsShipmentEngine.js";
import {
  buildCourierId,
  mapCourierRow,
  validateCourierForm,
} from "@/logistics/logisticsCourierEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error) {
  const msg = str(error?.message).toLowerCase();
  return msg.includes("order_shipments") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

function isMissingCourierTableError(error) {
  const msg = str(error?.message).toLowerCase();
  return msg.includes("logistics_couriers") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

async function resolveLabContext(labId, tenantId) {
  if (!supabase || !labId) return { labName: "", labCity: "" };
  const { data } = await supabase
    .from("v_labs_credit")
    .select("lab_id,lab_name,area,tenant_id")
    .eq("tenant_id", tenantId)
    .eq("lab_id", labId)
    .maybeSingle();
  if (!data) return { labName: "", labCity: "" };
  return {
    labName: str(data.lab_name ?? data.labName) || labId,
    labCity: str(data.area ?? data.lab_city ?? data.city),
  };
}

/**
 * Idempotent shipment create after order fulfill — never throws; does not affect fulfill result.
 */
export async function createShipmentForFulfilledOrderWrite({
  tenantId,
  orderId,
  labId = "",
  labName = "",
  labCity = "",
  orderValue = 0,
  distributorId = "",
  actorId = "",
  createdSource = "createShipmentForFulfilledOrderWrite",
} = {}) {
  if (!supabase) {
    return { success: false, skipped: true, error: "Supabase not configured", data: null };
  }

  const tid = str(tenantId);
  const oid = str(orderId);
  if (!tid || !oid) {
    return { success: false, error: "tenantId and orderId are required", data: null };
  }

  const shipmentId = buildShipmentIdForOrder(oid);
  if (!shipmentId) {
    return { success: false, error: "Could not build shipment id", data: null };
  }

  try {
    logSupabaseFeatureSource("Logistics.createShipmentForFulfilledOrder", {
      table: "order_shipments",
      orderId: oid,
    });

    const { data: existing, error: existingErr } = await supabase
      .from("order_shipments")
      .select("shipment_id,order_id,dispatch_status")
      .eq("tenant_id", tid)
      .eq("order_id", oid)
      .maybeSingle();

    if (existingErr && !isMissingTableError(existingErr)) {
      hqDebugWarn(`[${createdSource}] shipment lookup:`, existingErr.message);
      return { success: false, error: existingErr.message, data: null };
    }
    if (isMissingTableError(existingErr)) {
      hqDebugWarn(`[${createdSource}] order_shipments table missing — apply logistics migration`);
      return { success: false, skipped: true, error: existingErr.message, data: null };
    }

    if (existing?.shipment_id) {
      return {
        success: true,
        skipped: true,
        data: mapShipmentRow(existing),
        error: null,
      };
    }

    let resolvedLabName = str(labName);
    let resolvedLabCity = str(labCity);
    const lid = str(labId);
    if (lid && (!resolvedLabName || !resolvedLabCity)) {
      const ctx = await resolveLabContext(lid, tid);
      if (!resolvedLabName) resolvedLabName = ctx.labName;
      if (!resolvedLabCity) resolvedLabCity = ctx.labCity;
    }

    const now = new Date().toISOString();
    const row = {
      shipment_id: shipmentId,
      tenant_id: tid,
      order_id: oid,
      lab_id: lid || null,
      lab_name: resolvedLabName || null,
      lab_city: resolvedLabCity || null,
      distributor_id: str(distributorId) || null,
      order_value: num(orderValue),
      dispatch_status: SHIPMENT_STATUS.READY,
      created_by: str(actorId) || null,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("order_shipments")
      .insert([row])
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: raced } = await supabase
          .from("order_shipments")
          .select("*")
          .eq("tenant_id", tid)
          .eq("order_id", oid)
          .maybeSingle();
        return { success: true, skipped: true, data: mapShipmentRow(raced), error: null };
      }
      hqDebugWarn(`[${createdSource}] shipment insert:`, insertErr.message);
      return { success: false, error: insertErr.message, data: null };
    }

    await supabase.from("shipment_status_events").insert([
      {
        shipment_id: shipmentId,
        tenant_id: tid,
        from_status: null,
        to_status: SHIPMENT_STATUS.READY,
        actor_id: str(actorId) || null,
        notes: `Auto-created after order fulfilled (${createdSource})`,
      },
    ]);

    hqDebugLog("SHIPMENT CREATED FOR ORDER", { orderId: oid, shipmentId, source: createdSource });
    return { success: true, skipped: false, data: mapShipmentRow(inserted), error: null };
  } catch (err) {
    hqDebugWarn(`[${createdSource}] shipment create failed:`, err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

export async function getLogisticsShipmentsRead({ tenantId, limit = 500 } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", shipments: [] };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", shipments: [] };

  logSupabaseFeatureSource("Logistics.getLogisticsShipmentsRead", { table: "order_shipments" });
  const { data, error } = await supabase
    .from("order_shipments")
    .select("*")
    .eq("tenant_id", tid)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 500, 2000));

  if (error) {
    if (isMissingTableError(error)) {
      return { success: true, shipments: [], warning: "order_shipments table not deployed" };
    }
    return { success: false, error: error.message, shipments: [] };
  }

  return {
    success: true,
    shipments: (data || []).map(mapShipmentRow),
    error: null,
  };
}

export async function getShipmentByOrderRead({ tenantId, orderId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", shipment: null };
  const tid = str(tenantId);
  const oid = str(orderId);
  if (!tid || !oid) return { success: false, error: "tenantId and orderId required", shipment: null };

  const { data, error } = await supabase
    .from("order_shipments")
    .select("*")
    .eq("tenant_id", tid)
    .eq("order_id", oid)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return { success: true, shipment: null };
    return { success: false, error: error.message, shipment: null };
  }

  return { success: true, shipment: data ? mapShipmentRow(data) : null, error: null };
}

export async function getShipmentEventsRead({ tenantId, shipmentId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", events: [] };
  const tid = str(tenantId);
  const sid = str(shipmentId);
  if (!tid || !sid) return { success: false, error: "tenantId and shipmentId required", events: [] };

  const { data, error } = await supabase
    .from("shipment_status_events")
    .select("*")
    .eq("tenant_id", tid)
    .eq("shipment_id", sid)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return { success: true, events: [] };
    return { success: false, error: error.message, events: [] };
  }

  return { success: true, events: (data || []).map(mapShipmentEventRow), error: null };
}

export async function updateShipmentAssignmentWrite(shipmentId, payload = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const sid = str(shipmentId);
  if (!sid) return { success: false, error: "shipmentId required", data: null };

  const patch = {
    updated_at: new Date().toISOString(),
  };
  if (payload.deliveryMethod !== undefined) patch.delivery_method = str(payload.deliveryMethod) || null;
  if (payload.assignedToType !== undefined) patch.assigned_to_type = str(payload.assignedToType) || null;
  if (payload.assignedToId !== undefined) patch.assigned_to_id = str(payload.assignedToId) || null;
  if (payload.assignedToName !== undefined) patch.assigned_to_name = str(payload.assignedToName) || null;
  if (payload.courierName !== undefined) patch.courier_name = str(payload.courierName) || null;
  if (payload.courierId !== undefined) patch.courier_id = str(payload.courierId) || null;
  if (payload.trackingNumber !== undefined) patch.tracking_number = str(payload.trackingNumber) || null;
  if (payload.vehicleRef !== undefined) patch.vehicle_ref = str(payload.vehicleRef) || null;
  if (payload.expectedDispatchBy !== undefined) {
    patch.expected_dispatch_by = str(payload.expectedDispatchBy) || null;
  }
  if (payload.expectedDeliveryBy !== undefined) {
    patch.expected_delivery_by = str(payload.expectedDeliveryBy) || null;
  }
  if (payload.deliveryNotes !== undefined) patch.delivery_notes = str(payload.deliveryNotes) || null;
  if (payload.dispatchNotes !== undefined) patch.dispatch_notes = str(payload.dispatchNotes) || null;
  if (payload.dispatchDate !== undefined) patch.dispatch_date = str(payload.dispatchDate) || null;

  const { data, error } = await supabase
    .from("order_shipments")
    .update(patch)
    .eq("shipment_id", sid)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: mapShipmentRow(data), error: null };
}

export async function transitionShipmentStatusWrite({
  shipmentId,
  tenantId,
  toStatus,
  actorId = "",
  notes = "",
  pod = {},
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const sid = str(shipmentId);
  const tid = str(tenantId);
  const next = str(toStatus).toLowerCase();
  if (!sid || !tid || !next) {
    return { success: false, error: "shipmentId, tenantId, and toStatus required", data: null };
  }

  const { data: current, error: readErr } = await supabase
    .from("order_shipments")
    .select("*")
    .eq("shipment_id", sid)
    .eq("tenant_id", tid)
    .maybeSingle();

  if (readErr) return { success: false, error: readErr.message, data: null };
  if (!current) return { success: false, error: "Shipment not found", data: null };

  const from = str(current.dispatch_status).toLowerCase();
  if (!canTransitionShipmentStatus(from, next)) {
    return {
      success: false,
      error: `Invalid transition ${from} → ${next}`,
      data: null,
    };
  }

  const patch = {
    dispatch_status: next,
    updated_at: new Date().toISOString(),
  };

  if (next === SHIPMENT_STATUS.ASSIGNED && !str(current.dispatch_date)) {
    patch.dispatch_date = new Date().toISOString().slice(0, 10);
  }
  if (next === SHIPMENT_STATUS.DELIVERED) {
    patch.delivered_at = str(pod.deliveredAt) || new Date().toISOString();
    if (pod.receiverName !== undefined) patch.receiver_name = str(pod.receiverName) || null;
    if (pod.receiverPhone !== undefined) patch.receiver_phone = str(pod.receiverPhone) || null;
    if (pod.deliveryNotes !== undefined) patch.delivery_notes = str(pod.deliveryNotes) || null;
  }
  if (next === SHIPMENT_STATUS.FAILED && pod.failureReason !== undefined) {
    patch.failure_reason = str(pod.failureReason) || null;
  }
  if (next === SHIPMENT_STATUS.RESCHEDULED && pod.rescheduledFor !== undefined) {
    patch.rescheduled_for = str(pod.rescheduledFor) || null;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("order_shipments")
    .update(patch)
    .eq("shipment_id", sid)
    .select()
    .single();

  if (updateErr) return { success: false, error: updateErr.message, data: null };

  await supabase.from("shipment_status_events").insert([
    {
      shipment_id: sid,
      tenant_id: tid,
      from_status: from,
      to_status: next,
      actor_id: str(actorId) || null,
      notes: str(notes) || null,
    },
  ]);

  return { success: true, data: mapShipmentRow(updated), error: null };
}

export async function getLogisticsCouriersRead({ tenantId, activeOnly = false } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", couriers: [] };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", couriers: [] };

  logSupabaseFeatureSource("Logistics.getLogisticsCouriersRead", { table: "logistics_couriers" });
  let query = supabase
    .from("logistics_couriers")
    .select("*")
    .eq("tenant_id", tid)
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingCourierTableError(error)) {
      return { success: true, couriers: [], warning: "logistics_couriers table not deployed" };
    }
    return { success: false, error: error.message, couriers: [] };
  }

  return { success: true, couriers: (data || []).map(mapCourierRow), error: null };
}

export async function upsertLogisticsCourierWrite({
  tenantId,
  courierId = "",
  name = "",
  contactPerson = "",
  phone = "",
  email = "",
  vehicleType = "",
  isActive = true,
  notes = "",
  actorId = "",
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", data: null };

  const validation = validateCourierForm({ name });
  if (!validation.valid) return { success: false, error: validation.error, data: null };

  const cid = str(courierId) || buildCourierId();
  const now = new Date().toISOString();
  const row = {
    courier_id: cid,
    tenant_id: tid,
    name: str(name),
    contact_person: str(contactPerson) || null,
    phone: str(phone) || null,
    email: str(email) || null,
    vehicle_type: str(vehicleType) || null,
    is_active: Boolean(isActive),
    notes: str(notes) || null,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from("logistics_couriers")
    .select("courier_id")
    .eq("courier_id", cid)
    .maybeSingle();

  let result;
  if (existing?.courier_id) {
    result = await supabase.from("logistics_couriers").update(row).eq("courier_id", cid).select().single();
  } else {
    result = await supabase
      .from("logistics_couriers")
      .insert([{ ...row, created_by: str(actorId) || null, created_at: now }])
      .select()
      .single();
  }

  if (result.error) {
    if (isMissingCourierTableError(result.error)) {
      return { success: false, error: "logistics_couriers table not deployed", data: null };
    }
    return { success: false, error: result.error.message, data: null };
  }

  return { success: true, data: mapCourierRow(result.data), error: null };
}

export async function setLogisticsCourierActiveWrite(courierId, isActive, tenantId) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const cid = str(courierId);
  const tid = str(tenantId);
  if (!cid || !tid) return { success: false, error: "courierId and tenantId required", data: null };

  const { data, error } = await supabase
    .from("logistics_couriers")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("courier_id", cid)
    .eq("tenant_id", tid)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: mapCourierRow(data), error: null };
}
