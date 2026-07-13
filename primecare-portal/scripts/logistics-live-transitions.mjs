import { readFileSync } from "node:fs";
import { QA_ADMIN, QA_HQ_TENANT_ID as HQ } from "./qaCredentials.mjs";
import { transitionShipmentStatusWrite, createShipmentForFulfilledOrderWrite } from "../src/api/logisticsSupabaseApi.js";

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

const { supabase } = await import("../src/api/supabaseClient.js");
await supabase.auth.signInWithPassword({ email: QA_ADMIN.email, password: QA_ADMIN.password });

const sid = "SHP-GP-PROBE3-1782519854360";
for (const [to, pod] of [
  ["assigned", {}],
  ["out_for_delivery", {}],
  ["delivered", { receiverName: "QA Receiver" }],
]) {
  const r = await transitionShipmentStatusWrite({
    shipmentId: sid,
    tenantId: HQ,
    toStatus: to,
    actorId: QA_ADMIN.email,
    pod,
  });
  console.log(to, r.success ? "PASS" : `FAIL ${r.error}`);
}

const dup = await createShipmentForFulfilledOrderWrite({
  tenantId: HQ,
  orderId: "GP-PROBE3-1782519854360",
  createdSource: "uat-idempotency",
});
console.log("idempotent", dup.success && dup.skipped ? "PASS" : "FAIL");

const failOid = "QA_ORD_001";
let { data: fs } = await supabase
  .from("order_shipments")
  .select("shipment_id,dispatch_status")
  .eq("order_id", failOid)
  .maybeSingle();
if (!fs) {
  await createShipmentForFulfilledOrderWrite({
    tenantId: HQ,
    orderId: failOid,
    labId: "QA_LAB_001",
    createdSource: "uat-fail-path",
  });
  ({ data: fs } = await supabase
    .from("order_shipments")
    .select("shipment_id,dispatch_status")
    .eq("order_id", failOid)
    .maybeSingle());
}
if (fs && fs.dispatch_status === "ready_for_dispatch") {
  for (const [to, pod] of [
    ["assigned", {}],
    ["out_for_delivery", {}],
    ["delivery_failed", { failureReason: "QA gate closed" }],
    ["rescheduled", { rescheduledFor: "2026-07-02" }],
    ["out_for_delivery", {}],
    ["delivered", { receiverName: "QA Reschedule Receiver" }],
  ]) {
    const r = await transitionShipmentStatusWrite({
      shipmentId: fs.shipment_id,
      tenantId: HQ,
      toStatus: to,
      actorId: QA_ADMIN.email,
      pod,
    });
    console.log("failpath", to, r.success ? "PASS" : `FAIL ${r.error}`);
  }
}
