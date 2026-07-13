#!/usr/bin/env node
/**
 * Live QA UAT: fulfill order → invoice/AR/shipment + status transitions.
 * Usage: npx vite-node scripts/logistics-live-fulfill-uat.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { updateOrderStatusWrite } from "../src/api/primecareSupabaseApi.js";
import {
  createShipmentForFulfilledOrderWrite,
  transitionShipmentStatusWrite,
} from "../src/api/logisticsSupabaseApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || QA_HQ_TENANT_ID;

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

async function signInAdmin(env) {
  const { supabase } = await import("../src/api/supabaseClient.js");
  const { error } = await supabase.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (error) throw new Error(`Admin auth failed: ${error.message}`);
  return supabase;
}

async function orderHasLines(sb, orderId) {
  const oid = str(orderId);
  const { data: lines } = await sb.from("order_lines").select("order_id").eq("order_id", oid).limit(1);
  if ((lines || []).length) return true;
  const { data: items } = await sb.from("order_items").select("order_id").eq("order_id", oid).limit(1);
  return (items || []).length > 0;
}

async function pickTestOrder(sb) {
  const { data: placed } = await sb
    .from("orders")
    .select("order_id,status,lab_id,total_amount,tenant_id,ar_posted,invoice_id")
    .eq("tenant_id", HQ)
    .ilike("status", "placed")
    .order("created_at", { ascending: false })
    .limit(30);

  for (const row of placed || []) {
    if (await orderHasLines(sb, row.order_id)) return row;
    if (num(row.total_amount) > 0) return row;
  }

  const { data: processing } = await sb
    .from("orders")
    .select("order_id,status,lab_id,total_amount,tenant_id,ar_posted,invoice_id")
    .eq("tenant_id", HQ)
    .ilike("status", "processing")
    .order("created_at", { ascending: false })
    .limit(10);

  for (const row of processing || []) {
    if (await orderHasLines(sb, row.order_id)) return row;
  }

  return null;
}

async function main() {
  console.log("\n=== Logistics Live Fulfill UAT ===\n");
  const env = loadEnv();
  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

  const sb = await signInAdmin(env);
  const order = await pickTestOrder(sb);
  if (!order) {
    console.error("FAIL: No Placed/Processing order with lines found for fulfill test");
    process.exit(1);
  }

  const orderId = str(order.order_id);
  const shipmentId = `SHP-${orderId}`;
  console.log(`Test order: ${orderId} (status=${order.status})`);

  const arBefore = await sb
    .from("lab_ar_balances")
    .select("outstanding_balance")
    .eq("tenant_id", HQ)
    .eq("lab_id", str(order.lab_id))
    .maybeSingle();

  const fulfillRes = await updateOrderStatusWrite(orderId, "Fulfilled", {
    note: "Logistics Phase 1A live UAT fulfill",
  });

  if (!fulfillRes.success) {
    console.error("FAIL fulfill:", fulfillRes.error);
    process.exit(1);
  }
  console.log("PASS fulfill: order marked Fulfilled");

  const { data: orderAfter } = await sb
    .from("orders")
    .select("order_id,status,ar_posted,invoice_id")
    .eq("tenant_id", HQ)
    .eq("order_id", orderId)
    .maybeSingle();

  if (!orderAfter || !str(orderAfter.status).toLowerCase().includes("fulfilled")) {
    console.error("FAIL: order status not Fulfilled after update");
    process.exit(1);
  }
  console.log("PASS order status persisted");

  const { data: invoice } = await sb
    .from("invoices")
    .select("invoice_id,order_id,status")
    .eq("tenant_id", HQ)
    .eq("order_id", orderId)
    .maybeSingle();

  if (!invoice?.invoice_id) {
    console.error("FAIL: no invoice created for fulfilled order");
    process.exit(1);
  }
  console.log(`PASS invoice created: ${invoice.invoice_id}`);

  if (!orderAfter.ar_posted) {
    console.warn("WARN: ar_posted not set on order row (check lab AR separately)");
  } else {
    console.log("PASS ar_posted flag set on order");
  }

  const { data: shipments } = await sb
    .from("order_shipments")
    .select("shipment_id,order_id,dispatch_status")
    .eq("tenant_id", HQ)
    .eq("order_id", orderId);

  if ((shipments || []).length !== 1) {
    console.error(`FAIL: expected 1 shipment, got ${(shipments || []).length}`);
    process.exit(1);
  }
  if (str(shipments[0].shipment_id) !== shipmentId) {
    console.error(`FAIL: expected ${shipmentId}, got ${shipments[0].shipment_id}`);
    process.exit(1);
  }
  console.log(`PASS shipment created: ${shipmentId}`);

  const dupRes = await createShipmentForFulfilledOrderWrite({
    tenantId: HQ,
    orderId,
    labId: str(order.lab_id),
    orderValue: num(order.total_amount),
    createdSource: "logistics-live-uat-idempotency",
  });
  if (!dupRes.success || !dupRes.skipped) {
    console.error("FAIL idempotency:", dupRes.error || "second create did not skip");
    process.exit(1);
  }
  const { data: shipments2 } = await sb
    .from("order_shipments")
    .select("shipment_id")
    .eq("tenant_id", HQ)
    .eq("order_id", orderId);
  if ((shipments2 || []).length !== 1) {
    console.error("FAIL: duplicate shipment after idempotent retry");
    process.exit(1);
  }
  console.log("PASS idempotent shipment create (no duplicate)");

  const reFulfill = await updateOrderStatusWrite(orderId, "Fulfilled", {
    note: "Logistics UAT re-fulfill idempotency",
  });
  if (!reFulfill.success) {
    console.error("FAIL re-fulfill:", reFulfill.error);
    process.exit(1);
  }
  const { data: shipments3 } = await sb
    .from("order_shipments")
    .select("shipment_id")
    .eq("tenant_id", HQ)
    .eq("order_id", orderId);
  if ((shipments3 || []).length !== 1) {
    console.error("FAIL: re-fulfill created duplicate shipment");
    process.exit(1);
  }
  console.log("PASS re-fulfill does not duplicate shipment");

  const transitions = [
    ["assigned", {}],
    ["out_for_delivery", {}],
    ["delivered", { deliveredAt: new Date().toISOString(), receiverName: "QA Receiver" }],
  ];

  for (const [toStatus, pod] of transitions) {
    const tr = await transitionShipmentStatusWrite({
      shipmentId,
      tenantId: HQ,
      toStatus,
      actorId: QA_ADMIN.email,
      pod,
    });
    if (!tr.success) {
      console.error(`FAIL transition → ${toStatus}:`, tr.error);
      process.exit(1);
    }
    console.log(`PASS transition → ${toStatus}`);
  }

  const { data: failOrder } = await sb
    .from("orders")
    .select("order_id,status,lab_id,total_amount")
    .eq("tenant_id", HQ)
    .ilike("status", "fulfilled")
    .neq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (failOrder?.order_id) {
    const failOid = str(failOrder.order_id);
    const failSid = `SHP-${failOid}`;
    let { data: failShip } = await sb
      .from("order_shipments")
      .select("shipment_id,dispatch_status")
      .eq("tenant_id", HQ)
      .eq("order_id", failOid)
      .maybeSingle();

    if (!failShip) {
      await createShipmentForFulfilledOrderWrite({
        tenantId: HQ,
        orderId: failOid,
        labId: str(failOrder.lab_id),
        orderValue: num(failOrder.total_amount),
        createdSource: "logistics-live-uat-failure-path",
      });
      ({ data: failShip } = await sb
        .from("order_shipments")
        .select("shipment_id,dispatch_status")
        .eq("tenant_id", HQ)
        .eq("order_id", failOid)
        .maybeSingle());
    }

    if (failShip?.shipment_id) {
      const path = [
        ["assigned", {}],
        ["out_for_delivery", {}],
        ["delivery_failed", { failureReason: "QA gate closed" }],
        ["rescheduled", { rescheduledFor: new Date().toISOString().slice(0, 10) }],
        ["out_for_delivery", {}],
        ["delivered", { receiverName: "QA Reschedule Receiver" }],
      ];
      for (const [toStatus, pod] of path) {
        const tr = await transitionShipmentStatusWrite({
          shipmentId: failShip.shipment_id,
          tenantId: HQ,
          toStatus,
          actorId: QA_ADMIN.email,
          pod,
        });
        if (!tr.success) {
          console.error(`FAIL failure-path ${toStatus}:`, tr.error);
          process.exit(1);
        }
        console.log(`PASS failure-path → ${toStatus} (${failSid})`);
      }
    }
  }

  console.log("\nLogistics live fulfill UAT passed.\n");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
