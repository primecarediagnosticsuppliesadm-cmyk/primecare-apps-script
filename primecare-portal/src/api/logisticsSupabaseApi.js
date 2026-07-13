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
import {
  buildRouteCode,
  buildWarehouseId,
  mapRouteRow,
  mapRouteStopRow,
  mapWarehouseRow,
  normalizeDeliveryDay,
  ROUTE_STATUS,
  validateRouteForm,
} from "@/logistics/logisticsRouteEngine.js";
import { reconcileDeliveryChargeForShipmentWrite } from "@/api/deliveryChargeSupabaseApi.js";

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

function isMissingRouteTableError(error) {
  const msg = str(error?.message).toLowerCase();
  return (
    (msg.includes("delivery_routes") ||
      msg.includes("delivery_route_shipments") ||
      msg.includes("logistics_warehouses")) &&
    (msg.includes("does not exist") || msg.includes("schema cache"))
  );
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
  deliveryChargeAmount = 0,
  deliveryChargeReason = "",
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
      delivery_charge_amount: num(deliveryChargeAmount),
      delivery_charge_reason: str(deliveryChargeReason) || null,
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

  const deliveryMethod = str(payload.deliveryMethod);
  if (deliveryMethod && data?.order_id && data?.tenant_id) {
    await reconcileDeliveryChargeForShipmentWrite({
      tenantId: data.tenant_id,
      orderId: data.order_id,
      labId: data.lab_id,
      deliveryMethod,
    });
    const { data: refreshed } = await supabase
      .from("order_shipments")
      .select("*")
      .eq("shipment_id", sid)
      .maybeSingle();
    return { success: true, data: mapShipmentRow(refreshed || data), error: null };
  }

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

export async function getLogisticsWarehousesRead({ tenantId, activeOnly = true } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", warehouses: [] };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", warehouses: [] };

  let query = supabase
    .from("logistics_warehouses")
    .select("*")
    .eq("tenant_id", tid)
    .order("warehouse_name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    if (isMissingRouteTableError(error)) {
      return { success: true, warehouses: [], warning: "logistics_warehouses not deployed" };
    }
    return { success: false, error: error.message, warehouses: [] };
  }
  return { success: true, warehouses: (data || []).map(mapWarehouseRow), error: null };
}

export async function upsertLogisticsWarehouseWrite({
  tenantId,
  warehouseId = "",
  warehouseCode = "",
  warehouseName = "",
  city = "",
  isActive = true,
  notes = "",
  actorId = "",
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", data: null };
  if (!str(warehouseName)) return { success: false, error: "Warehouse name is required", data: null };

  const wid = str(warehouseId) || buildWarehouseId();
  const code = str(warehouseCode) || wid;
  const now = new Date().toISOString();
  const row = {
    warehouse_id: wid,
    tenant_id: tid,
    warehouse_code: code,
    warehouse_name: str(warehouseName),
    city: str(city) || null,
    is_active: Boolean(isActive),
    notes: str(notes) || null,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from("logistics_warehouses")
    .select("warehouse_id")
    .eq("warehouse_id", wid)
    .maybeSingle();

  const result = existing?.warehouse_id
    ? await supabase.from("logistics_warehouses").update(row).eq("warehouse_id", wid).select().single()
    : await supabase
        .from("logistics_warehouses")
        .insert([{ ...row, created_by: str(actorId) || null, created_at: now }])
        .select()
        .single();

  if (result.error) {
    if (isMissingRouteTableError(result.error)) {
      return { success: false, error: "logistics_warehouses not deployed", data: null };
    }
    return { success: false, error: result.error.message, data: null };
  }
  return { success: true, data: mapWarehouseRow(result.data), error: null };
}

export async function getDeliveryRoutesRead({ tenantId, plannedDate = "" } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", routes: [] };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", routes: [] };

  let query = supabase
    .from("delivery_routes")
    .select("*")
    .eq("tenant_id", tid)
    .order("planned_date", { ascending: false })
    .order("created_at", { ascending: false });

  const dateFilter = str(plannedDate);
  if (dateFilter) query = query.eq("planned_date", dateFilter);

  const { data, error } = await query;
  if (error) {
    if (isMissingRouteTableError(error)) {
      return { success: true, routes: [], warning: "delivery_routes not deployed" };
    }
    return { success: false, error: error.message, routes: [] };
  }
  return { success: true, routes: (data || []).map(mapRouteRow), error: null };
}

export async function getDeliveryRouteStopsRead({ routeId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", stops: [] };
  const rid = str(routeId);
  if (!rid) return { success: false, error: "routeId required", stops: [] };

  const { data, error } = await supabase
    .from("delivery_route_shipments")
    .select("*, shipment:order_shipments(shipment_id,order_id,lab_id,lab_name,lab_city,dispatch_status,expected_delivery_by)")
    .eq("route_id", rid)
    .order("sequence_number", { ascending: true });

  if (error) {
    if (isMissingRouteTableError(error)) return { success: true, stops: [] };
    return { success: false, error: error.message, stops: [] };
  }
  return { success: true, stops: (data || []).map(mapRouteStopRow), error: null };
}

export async function getShipmentRouteAssignmentRead({ shipmentId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", assignment: null };
  const sid = str(shipmentId);
  if (!sid) return { success: false, error: "shipmentId required", assignment: null };

  const { data, error } = await supabase
    .from("delivery_route_shipments")
    .select("*, route:delivery_routes(*), warehouse:delivery_routes(logistics_warehouses(*))")
    .eq("shipment_id", sid)
    .maybeSingle();

  if (error) {
    if (isMissingRouteTableError(error)) return { success: true, assignment: null };
    return { success: false, error: error.message, assignment: null };
  }
  if (!data) return { success: true, assignment: null, error: null };

  const route = mapRouteRow(data.route);
  let warehouse = null;
  if (route?.warehouseId) {
    const whRes = await supabase
      .from("logistics_warehouses")
      .select("*")
      .eq("warehouse_id", route.warehouseId)
      .maybeSingle();
    if (whRes.data) warehouse = mapWarehouseRow(whRes.data);
  }

  return {
    success: true,
    assignment: {
      ...mapRouteStopRow(data),
      route,
      warehouse,
    },
    error: null,
  };
}

export async function getLabPreferredDeliveryDaysRead({ tenantId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", labDays: {} };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", labDays: {} };

  const { data, error } = await supabase
    .from("labs")
    .select("lab_id, preferred_delivery_day")
    .eq("tenant_id", tid);

  if (error) {
    const msg = str(error.message).toLowerCase();
    if (msg.includes("preferred_delivery_day") && msg.includes("does not exist")) {
      return { success: true, labDays: {}, warning: "preferred_delivery_day not deployed" };
    }
    return { success: false, error: error.message, labDays: {} };
  }

  const labDays = {};
  for (const row of data || []) {
    labDays[str(row.lab_id)] = normalizeDeliveryDay(row.preferred_delivery_day);
  }
  return { success: true, labDays, error: null };
}

export async function updateLabPreferredDeliveryDayWrite({
  tenantId,
  labId,
  preferredDeliveryDay = "",
  actorId = "",
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const tid = str(tenantId);
  const lid = str(labId);
  if (!tid || !lid) return { success: false, error: "tenantId and labId required", data: null };

  const day = normalizeDeliveryDay(preferredDeliveryDay);
  const { data, error } = await supabase
    .from("labs")
    .update({
      preferred_delivery_day: day || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tid)
    .eq("lab_id", lid)
    .select("lab_id, lab_name, preferred_delivery_day, tenant_id")
    .maybeSingle();

  if (error) {
    const msg = str(error.message).toLowerCase();
    if (msg.includes("preferred_delivery_day") && msg.includes("does not exist")) {
      return { success: false, error: "preferred_delivery_day not deployed — apply migration", data: null };
    }
    return { success: false, error: error.message, data: null };
  }
  if (!data) return { success: false, error: "Lab not found or not authorized", data: null };

  hqDebugLog("[updateLabPreferredDeliveryDayWrite]", { labId: lid, preferredDeliveryDay: day, actorId: str(actorId) });
  return {
    success: true,
    data: {
      ...data,
      preferredDeliveryDay: normalizeDeliveryDay(data.preferred_delivery_day),
    },
    error: null,
  };
}

export async function createDeliveryRouteWrite({
  tenantId,
  routeName = "",
  routeCode = "",
  warehouseId = "",
  deliveryDay = "mon",
  vehicleType = "",
  capacity = 20,
  plannedDate = "",
  courierId = "",
  actorId = "",
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", data: null };

  const validation = validateRouteForm({ routeName, capacity });
  if (!validation.valid) return { success: false, error: validation.error, data: null };

  const now = new Date().toISOString();
  const row = {
    tenant_id: tid,
    route_code: str(routeCode) || buildRouteCode(),
    route_name: str(routeName),
    warehouse_id: str(warehouseId) || null,
    delivery_day: normalizeDeliveryDay(deliveryDay) || "mon",
    vehicle_type: str(vehicleType) || null,
    capacity: Math.max(1, Number(capacity) || 20),
    active: true,
    route_status: ROUTE_STATUS.PLANNING,
    courier_id: str(courierId) || null,
    planned_date: str(plannedDate) || now.slice(0, 10),
    created_by: str(actorId) || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from("delivery_routes").insert([row]).select().single();
  if (error) {
    if (isMissingRouteTableError(error)) {
      return { success: false, error: "delivery_routes not deployed", data: null };
    }
    return { success: false, error: error.message, data: null };
  }
  return { success: true, data: mapRouteRow(data), error: null };
}

export async function updateDeliveryRouteWrite(routeId, patch = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const rid = str(routeId);
  if (!rid) return { success: false, error: "routeId required", data: null };

  const row = { updated_at: new Date().toISOString() };
  if (patch.routeName !== undefined) row.route_name = str(patch.routeName);
  if (patch.warehouseId !== undefined) row.warehouse_id = str(patch.warehouseId) || null;
  if (patch.deliveryDay !== undefined) row.delivery_day = normalizeDeliveryDay(patch.deliveryDay) || "mon";
  if (patch.vehicleType !== undefined) row.vehicle_type = str(patch.vehicleType) || null;
  if (patch.capacity !== undefined) row.capacity = Math.max(1, Number(patch.capacity) || 1);
  if (patch.active !== undefined) row.active = Boolean(patch.active);
  if (patch.routeStatus !== undefined) row.route_status = str(patch.routeStatus).toLowerCase();
  if (patch.courierId !== undefined) row.courier_id = str(patch.courierId) || null;
  if (patch.plannedDate !== undefined) row.planned_date = str(patch.plannedDate) || null;

  const { data, error } = await supabase
    .from("delivery_routes")
    .update(row)
    .eq("id", rid)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: mapRouteRow(data), error: null };
}

export async function assignShipmentToRouteWrite({
  routeId,
  shipmentId,
  sequenceNumber = null,
  plannedDeliveryTime = null,
} = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const rid = str(routeId);
  const sid = str(shipmentId);
  if (!rid || !sid) return { success: false, error: "routeId and shipmentId required", data: null };

  const { data: route, error: routeErr } = await supabase
    .from("delivery_routes")
    .select("id,capacity,route_status")
    .eq("id", rid)
    .maybeSingle();
  if (routeErr) return { success: false, error: routeErr.message, data: null };
  if (!route) return { success: false, error: "Route not found", data: null };
  if (str(route.route_status) === ROUTE_STATUS.COMPLETED) {
    return { success: false, error: "Cannot assign shipments to a completed route", data: null };
  }

  const { count, error: countErr } = await supabase
    .from("delivery_route_shipments")
    .select("id", { count: "exact", head: true })
    .eq("route_id", rid);
  if (countErr) return { success: false, error: countErr.message, data: null };
  if ((count || 0) >= Number(route.capacity || 0)) {
    return { success: false, error: "Route capacity reached", data: null };
  }

  let seq = Number(sequenceNumber);
  if (!Number.isFinite(seq) || seq <= 0) {
    seq = (count || 0) + 1;
  }

  const row = {
    route_id: rid,
    shipment_id: sid,
    sequence_number: seq,
    planned_delivery_time: plannedDeliveryTime ? new Date(plannedDeliveryTime).toISOString() : null,
  };

  const { data, error } = await supabase
    .from("delivery_route_shipments")
    .upsert(row, { onConflict: "shipment_id" })
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  return { success: true, data: mapRouteStopRow(data), error: null };
}

export async function reorderRouteStopsWrite({ routeId, orderedShipmentIds = [] } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", stops: [] };
  const rid = str(routeId);
  if (!rid) return { success: false, error: "routeId required", stops: [] };
  const ids = (orderedShipmentIds || []).map((id) => str(id)).filter(Boolean);
  if (!ids.length) return { success: false, error: "orderedShipmentIds required", stops: [] };

  for (let i = 0; i < ids.length; i += 1) {
    const { error } = await supabase
      .from("delivery_route_shipments")
      .update({ sequence_number: i + 1 })
      .eq("route_id", rid)
      .eq("shipment_id", ids[i]);
    if (error) return { success: false, error: error.message, stops: [] };
  }

  return getDeliveryRouteStopsRead({ routeId: rid });
}

export async function removeShipmentFromRouteWrite({ routeId, shipmentId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const rid = str(routeId);
  const sid = str(shipmentId);
  if (!rid || !sid) return { success: false, error: "routeId and shipmentId required", data: null };

  const { error } = await supabase
    .from("delivery_route_shipments")
    .delete()
    .eq("route_id", rid)
    .eq("shipment_id", sid);
  if (error) return { success: false, error: error.message, data: null };

  const stopsRes = await getDeliveryRouteStopsRead({ routeId: rid });
  if (stopsRes.success && stopsRes.stops?.length) {
    await reorderRouteStopsWrite({
      routeId: rid,
      orderedShipmentIds: stopsRes.stops.map((s) => s.shipmentId),
    });
  }
  return { success: true, data: null, error: null };
}

export async function completeDeliveryRouteWrite({ routeId, actorId = "", failed = false } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", data: null };
  const rid = str(routeId);
  if (!rid) return { success: false, error: "routeId required", data: null };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("delivery_routes")
    .update({
      route_status: failed ? ROUTE_STATUS.FAILED : ROUTE_STATUS.COMPLETED,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", rid)
    .select()
    .single();

  if (error) return { success: false, error: error.message, data: null };
  hqDebugLog("[completeDeliveryRouteWrite]", { routeId: rid, status: data?.route_status, actorId: str(actorId) });
  return { success: true, data: mapRouteRow(data), error: null };
}

export async function getUnassignedShipmentsForPlanningRead({ tenantId } = {}) {
  if (!supabase) return { success: false, error: "Supabase not configured", shipments: [] };
  const tid = str(tenantId);
  if (!tid) return { success: false, error: "tenantId required", shipments: [] };

  const [shipmentsRes, assignedRes, labDaysRes] = await Promise.all([
    getLogisticsShipmentsRead({ tenantId: tid }),
    supabase.from("delivery_route_shipments").select("shipment_id"),
    getLabPreferredDeliveryDaysRead({ tenantId: tid }),
  ]);

  if (!shipmentsRes.success) {
    return { success: false, error: shipmentsRes.error, shipments: [] };
  }

  const assignedIds = new Set();
  if (assignedRes.error) {
    const msg = str(assignedRes.error.message).toLowerCase();
    if (!msg.includes("delivery_route_shipments") || !msg.includes("does not exist")) {
      // ignore missing table — treat all as unassigned
    }
  } else {
    for (const r of assignedRes.data || []) assignedIds.add(str(r.shipment_id));
  }
  const unassigned = (shipmentsRes.shipments || []).filter((s) => {
    if (assignedIds.has(s.shipmentId)) return false;
    const status = str(s.dispatchStatus).toLowerCase();
    return status === SHIPMENT_STATUS.READY || status === SHIPMENT_STATUS.ASSIGNED;
  });

  return {
    success: true,
    shipments: unassigned,
    labPreferredDays: labDaysRes.labDays || {},
    error: null,
  };
}
