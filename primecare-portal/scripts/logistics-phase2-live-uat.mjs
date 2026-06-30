#!/usr/bin/env node
/**
 * Live QA UAT — Logistics Phase 2 couriers + assignment validation.
 * Usage: npx vite-node scripts/logistics-phase2-live-uat.mjs
 */
import { readFileSync } from "node:fs";
import { QA_ADMIN, QA_HQ_TENANT_ID as HQ } from "./qaCredentials.mjs";
import {
  getLogisticsCouriersRead,
  getLogisticsShipmentsRead,
  setLogisticsCourierActiveWrite,
  transitionShipmentStatusWrite,
  updateShipmentAssignmentWrite,
  upsertLogisticsCourierWrite,
} from "../src/api/logisticsSupabaseApi.js";
import {
  ASSIGNMENT_TYPE,
  validateShipmentAssignment,
} from "../src/logistics/logisticsCourierEngine.js";
import { SHIPMENT_STATUS } from "../src/logistics/logisticsShipmentEngine.js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);
process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

const results = [];
function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}

const { supabase } = await import("../src/api/supabaseClient.js");
await supabase.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});

const testCourierName = `QA Phase2 Courier ${Date.now()}`;
let courierId = "";

// 1. Add courier
const created = await upsertLogisticsCourierWrite({
  tenantId: HQ,
  name: testCourierName,
  contactPerson: "QA Contact",
  phone: "9999999999",
  email: "qa.courier@test.local",
  vehicleType: "Van",
  notes: "Phase 2 live UAT",
  actorId: QA_ADMIN.email,
});
if (!created.success) {
  fail("courier.create", created.error);
  process.exit(1);
}
courierId = created.data.courierId;
pass("courier.create", `Created ${courierId}`);

// 2. Deactivate
const deactivated = await setLogisticsCourierActiveWrite(courierId, false, HQ);
if (!deactivated.success || deactivated.data.isActive !== false) {
  fail("courier.deactivate", deactivated.error || "not inactive");
  process.exit(1);
}
pass("courier.deactivate", "Courier deactivated");

// 3. Reactivate
const reactivated = await setLogisticsCourierActiveWrite(courierId, true, HQ);
if (!reactivated.success || reactivated.data.isActive !== true) {
  fail("courier.reactivate", reactivated.error || "not active");
  process.exit(1);
}
pass("courier.reactivate", "Courier reactivated");

// Pick a ready shipment or reset one for UAT
const shipsRes = await getLogisticsShipmentsRead({ tenantId: HQ });
const shipments = shipsRes.shipments || [];
let target =
  shipments.find((s) => s.dispatchStatus === SHIPMENT_STATUS.READY) ||
  shipments[0];
if (!target) {
  fail("shipment.pick", "No shipments available for assignment UAT");
  process.exit(1);
}

// Reset to ready for clean assignment tests if needed
if (target.dispatchStatus !== SHIPMENT_STATUS.READY) {
  await supabase
    .from("order_shipments")
    .update({
      dispatch_status: SHIPMENT_STATUS.READY,
      courier_id: null,
      dispatch_notes: null,
      delivery_method: null,
      tracking_number: null,
      assigned_to_name: null,
      delivered_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("shipment_id", target.shipmentId);
  target = { ...target, dispatchStatus: SHIPMENT_STATUS.READY };
}

const sid = target.shipmentId;

// 4. Validation — external without tracking fails
const badExt = validateShipmentAssignment({
  assignmentType: ASSIGNMENT_TYPE.EXTERNAL_COURIER,
  courierId,
  assignedToName: "Driver A",
  trackingNumber: "",
});
if (badExt.valid) fail("validation.external_no_tracking", "Should reject missing tracking");
else pass("validation.external_no_tracking", badExt.error);

// 5. Validation — external without courier fails
const badCourier = validateShipmentAssignment({
  assignmentType: ASSIGNMENT_TYPE.EXTERNAL_COURIER,
  courierId: "",
  assignedToName: "Driver A",
  trackingNumber: "TRK123",
});
if (badCourier.valid) fail("validation.external_no_courier", "Should reject missing courier");
else pass("validation.external_no_courier", badCourier.error);

// 6. Customer pickup — no courier/tracking required
const pickupOk = validateShipmentAssignment({
  assignmentType: ASSIGNMENT_TYPE.CUSTOMER_PICKUP,
  courierId: "",
  assignedToName: "",
  trackingNumber: "",
});
if (!pickupOk.valid) fail("validation.pickup", pickupOk.error);
else pass("validation.pickup", "Customer pickup skips courier/tracking");

// 7. Internal driver assignment
const internal = await updateShipmentAssignmentWrite(sid, {
  deliveryMethod: "primecare_delivery",
  assignedToType: "driver",
  assignedToName: "QA Internal Driver",
  expectedDeliveryBy: new Date().toISOString().slice(0, 10),
  dispatchNotes: "Internal driver UAT",
});
if (!internal.success) fail("assign.internal", internal.error);
else pass("assign.internal", "Internal driver saved");

// 8. External courier with tracking
const external = await updateShipmentAssignmentWrite(sid, {
  deliveryMethod: "courier",
  assignedToType: "courier",
  assignedToName: "QA Courier Handoff",
  courierId,
  courierName: testCourierName,
  trackingNumber: `TRK-P2-${Date.now()}`,
  dispatchNotes: "External courier UAT",
});
if (!external.success) fail("assign.external", external.error);
else pass("assign.external", "External courier + tracking saved");

// 9. Customer pickup assignment
const pickup = await updateShipmentAssignmentWrite(sid, {
  deliveryMethod: "customer_pickup",
  assignedToType: null,
  assignedToName: null,
  courierId: null,
  courierName: null,
  trackingNumber: null,
  dispatchNotes: "Customer pickup UAT",
});
if (!pickup.success) fail("assign.pickup", pickup.error);
else pass("assign.pickup", "Customer pickup saved without courier/tracking");

// 10. Status flow assigned → out → delivered
await updateShipmentAssignmentWrite(sid, {
  deliveryMethod: "primecare_delivery",
  assignedToType: "driver",
  assignedToName: "QA Flow Driver",
  dispatchNotes: "Flow test",
});

const toAssigned = await transitionShipmentStatusWrite({
  shipmentId: sid,
  tenantId: HQ,
  toStatus: SHIPMENT_STATUS.ASSIGNED,
  actorId: QA_ADMIN.email,
});
if (!toAssigned.success) fail("flow.assigned", toAssigned.error);
else pass("flow.assigned", "→ assigned");

const toOut = await transitionShipmentStatusWrite({
  shipmentId: sid,
  tenantId: HQ,
  toStatus: SHIPMENT_STATUS.OUT,
  actorId: QA_ADMIN.email,
});
if (!toOut.success) fail("flow.out", toOut.error);
else pass("flow.out", "→ out_for_delivery");

const deliveredAt = new Date().toISOString();
const toDelivered = await transitionShipmentStatusWrite({
  shipmentId: sid,
  tenantId: HQ,
  toStatus: SHIPMENT_STATUS.DELIVERED,
  actorId: QA_ADMIN.email,
  pod: { receiverName: "QA Receiver", deliveredAt },
});
if (!toDelivered.success) fail("flow.delivered", toDelivered.error);
else pass("flow.delivered", "→ delivered");

// 11. Delivered Today uses delivered_at
const { data: refreshed } = await supabase
  .from("order_shipments")
  .select("delivered_at,dispatch_status")
  .eq("shipment_id", sid)
  .maybeSingle();
const today = new Date().toDateString();
const deliveredDate = refreshed?.delivered_at ? new Date(refreshed.delivered_at).toDateString() : "";
if (deliveredDate === today) pass("delivered_at.today", `delivered_at=${refreshed.delivered_at}`);
else fail("delivered_at.today", `Expected today, got ${refreshed?.delivered_at}`);

const allShips = await getLogisticsShipmentsRead({ tenantId: HQ });
const todayCount = (allShips.shipments || []).filter((s) => {
  const d = s.deliveredAt ? new Date(s.deliveredAt) : null;
  return d && d.toDateString() === today;
}).length;
if (todayCount >= 1) pass("kpi.delivered_today", `delivered_at-based count=${todayCount}`);
else fail("kpi.delivered_today", "No shipments with delivered_at today");

// 12. Finance unchanged spot-check
const { data: orderRow } = await supabase
  .from("orders")
  .select("order_id,status,ar_posted,invoice_id")
  .eq("order_id", target.orderId)
  .maybeSingle();
if (orderRow?.status && String(orderRow.status).toLowerCase().includes("fulfilled")) {
  pass("finance.order_intact", `Order ${target.orderId} still fulfilled with invoice_id=${orderRow.invoice_id || "n/a"}`);
} else {
  fail("finance.order_intact", "Order row missing or not fulfilled");
}

console.log("\n=== Phase 2 Live UAT Summary ===");
const failed = results.filter((r) => r.status === "FAIL");
console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
console.log(`FAIL: ${failed.length}`);
if (failed.length) process.exit(1);
