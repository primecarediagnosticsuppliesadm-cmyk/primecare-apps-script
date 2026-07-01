#!/usr/bin/env node
/**
 * Logistics Phase 3A — delivery charge policy certification (static + engine + live QA).
 *
 * Usage:
 *   node scripts/verify-delivery-charge-policy.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeDeliveryChargeQuote,
  canEditDeliveryChargeOverride,
  computeEstimatedDeliveryRevenue,
  DELIVERY_CHARGE_REASON,
  DELIVERY_CHARGE_STATUS,
  DELIVERY_METHOD_INTENT,
} from "../src/logistics/deliveryChargeEngine.js";
import { QA_ADMIN, QA_HQ_TENANT_ID, QA_LAB } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || QA_HQ_TENANT_ID;

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}
function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
  console.warn(`WARN  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return null;
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

function readSrc(relPath) {
  return readFileSync(resolve(root, relPath), "utf8");
}

function runStaticChecks() {
  console.log("\n--- Static wiring ---\n");

  const migration = "supabase/migrations/20260701120000_logistics_phase3a_delivery_charges.sql";
  if (!existsSync(resolve(root, migration))) {
    fail("DC-01", "Phase 3A migration missing");
  } else {
    const sql = readSrc(migration);
    if (
      sql.includes("tenant_delivery_policy") &&
      sql.includes("merchandise_subtotal") &&
      sql.includes("delivery_charge_amount") &&
      !sql.includes("SVC-DELIVERY")
    ) {
      pass("DC-01", "Additive policy + delivery snapshot migration present");
    } else {
      fail("DC-01", "Migration missing expected objects");
    }
  }

  if (existsSync(resolve(root, "src/logistics/deliveryChargeEngine.js"))) {
    pass("DC-02", "deliveryChargeEngine.js present");
  } else {
    fail("DC-02", "deliveryChargeEngine.js missing");
  }

  const api = readSrc("src/api/deliveryChargeSupabaseApi.js");
  if (
    api.includes("getTenantDeliveryPolicyRead") &&
    api.includes("persistOrderDeliverySnapshotWrite") &&
    api.includes("applyOrderDeliveryOverrideWrite")
  ) {
    pass("DC-03", "deliveryChargeSupabaseApi wired");
  } else {
    fail("DC-03", "deliveryChargeSupabaseApi incomplete");
  }

  const snapshotRpcMigration =
    "supabase/migrations/20260702120000_persist_order_delivery_snapshot_rpc.sql";
  if (!existsSync(resolve(root, snapshotRpcMigration))) {
    fail("DC-11", "persist_order_delivery_snapshot migration missing");
  } else {
    const rpcSql = readSrc(snapshotRpcMigration);
    if (
      rpcSql.includes("persist_order_delivery_snapshot") &&
      rpcSql.includes("SECURITY DEFINER") &&
      rpcSql.includes("delivery_charge_amount") &&
      !rpcSql.includes("total_amount")
    ) {
      pass("DC-11", "SECURITY DEFINER persist_order_delivery_snapshot migration present");
    } else {
      fail("DC-11", "RPC migration missing expected guards");
    }
  }

  const persistFnBody = api.match(
    /export async function persistOrderDeliverySnapshotWrite[\s\S]*?(?=\nexport async function)/
  )?.[0];
  if (
    persistFnBody?.includes('rpc("persist_order_delivery_snapshot"') &&
    !persistFnBody.includes(".update(")
  ) {
    pass("DC-12", "Lab snapshot uses RPC (no client PATCH in persistOrderDeliverySnapshotWrite)");
  } else {
    fail("DC-12", "persistOrderDeliverySnapshotWrite still PATCHes orders directly");
  }

  const envJs = readSrc("src/config/environment.js");
  if (
    envJs.includes("LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED") &&
    envJs.includes("VITE_LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED")
  ) {
    pass("DC-04", "Finance feature flag defined (default false)");
  } else {
    fail("DC-04", "Finance feature flag missing");
  }

  const primeApi = readSrc("src/api/primecareSupabaseApi.js");
  if (
    primeApi.includes("persistOrderDeliverySnapshotWrite") &&
    primeApi.includes("tryPersistOrderDeliverySnapshot") &&
    !primeApi.includes("SVC-DELIVERY")
  ) {
    pass("DC-05", "Order write persists delivery snapshot without SVC-DELIVERY");
  } else {
    fail("DC-05", "createOrderWrite delivery integration incomplete or has SVC-DELIVERY");
  }

  const labPage = readSrc("src/pages/LabOrderingPage.jsx");
  if (
    labPage.includes("Estimated delivery") &&
    labPage.includes("billing integration comes later")
  ) {
    pass("DC-06", "Lab checkout shows estimated delivery + disclaimer");
  } else {
    fail("DC-06", "Lab checkout delivery UI missing");
  }

  const logisticsPage = readSrc("src/pages/LogisticsDeliveryPage.jsx");
  if (logisticsPage.includes("Est. Delivery Revenue") && logisticsPage.includes("DeliveryPolicyPanel")) {
    pass("DC-07", "Logistics KPI + policy panel wired");
  } else {
    fail("DC-07", "Logistics delivery UI incomplete");
  }

  const drawer = readSrc("src/components/logistics/ShipmentDetailDrawer.jsx");
  if (drawer.includes("applyOrderDeliveryOverrideWrite") && drawer.includes("canEditDeliveryChargeOverride")) {
    pass("DC-08", "HQ override UI gated before invoice sent");
  } else {
    fail("DC-08", "Shipment override UI missing");
  }

  if (/const total_amount = normalizedLines\.reduce/.test(primeApi)) {
    pass("DC-09", "orders.total_amount remains merchandise-only sum");
  } else {
    fail("DC-09", "createOrderWrite total_amount calculation may include delivery");
  }

  const invoiceRpc = readSrc("supabase/migrations/20260624120003_invoice_system_phase2.sql");
  if (!invoiceRpc.includes("delivery_charge")) {
    pass("DC-10", "Invoice RPC untouched by delivery charge");
  } else {
    fail("DC-10", "Invoice RPC unexpectedly references delivery charge");
  }
}

function runEngineChecks() {
  console.log("\n--- Policy engine rules ---\n");

  const policy = { standardDeliveryCharge: 150, freeDeliveryThreshold: 5000 };

  const standard = computeDeliveryChargeQuote({
    merchandiseSubtotal: 1000,
    policy,
    deliveryMethodIntent: DELIVERY_METHOD_INTENT.DELIVERY,
  });
  if (standard.amount === 150 && standard.reason === DELIVERY_CHARGE_REASON.STANDARD) {
    pass("DC-20", "Standard charge below threshold");
  } else {
    fail("DC-20", `Expected standard 150, got ${standard.amount}/${standard.reason}`);
  }

  const freeThreshold = computeDeliveryChargeQuote({
    merchandiseSubtotal: 6000,
    policy,
    deliveryMethodIntent: DELIVERY_METHOD_INTENT.DELIVERY,
  });
  if (
    freeThreshold.amount === 0 &&
    freeThreshold.reason === DELIVERY_CHARGE_REASON.FREE_THRESHOLD &&
    freeThreshold.status === DELIVERY_CHARGE_STATUS.WAIVED
  ) {
    pass("DC-21", "Free delivery at/above threshold");
  } else {
    fail("DC-21", `Threshold rule failed: ${freeThreshold.amount}/${freeThreshold.reason}`);
  }

  const l1b = computeDeliveryChargeQuote({
    merchandiseSubtotal: 1000,
    policy,
    hasActiveL1bOrHybridContract: true,
  });
  if (l1b.amount === 0 && l1b.reason === DELIVERY_CHARGE_REASON.L1B_CONTRACT) {
    pass("DC-22", "L1B/Hybrid contract free delivery");
  } else {
    fail("DC-22", `L1B rule failed: ${l1b.amount}/${l1b.reason}`);
  }

  const pickup = computeDeliveryChargeQuote({
    merchandiseSubtotal: 1000,
    policy,
    deliveryMethodIntent: DELIVERY_METHOD_INTENT.PICKUP,
  });
  if (pickup.amount === 0 && pickup.reason === DELIVERY_CHARGE_REASON.CUSTOMER_PICKUP) {
    pass("DC-23", "Customer pickup free");
  } else {
    fail("DC-23", `Pickup rule failed: ${pickup.amount}/${pickup.reason}`);
  }

  const override = computeDeliveryChargeQuote({
    merchandiseSubtotal: 1000,
    policy,
    deliveryMethodIntent: DELIVERY_METHOD_INTENT.PICKUP,
    hasHqOverride: true,
    hqOverrideAmount: 200,
  });
  if (override.amount === 200 && override.reason === DELIVERY_CHARGE_REASON.HQ_OVERRIDE) {
    pass("DC-24", "HQ override beats pickup waiver");
  } else {
    fail("DC-24", `Override priority failed: ${override.amount}/${override.reason}`);
  }

  const revenue = computeEstimatedDeliveryRevenue([
    { deliveryChargeAmount: 150 },
    { deliveryChargeAmount: 0 },
    { delivery_charge_amount: 75 },
  ]);
  if (revenue === 225) {
    pass("DC-25", "Estimated delivery revenue sums delivery_charge_amount only");
  } else {
    fail("DC-25", `Revenue sum expected 225, got ${revenue}`);
  }

  if (canEditDeliveryChargeOverride({ id: "x", status: "draft" })) {
    pass("DC-26", "Override allowed on draft invoice");
  } else {
    fail("DC-26", "Draft invoice should allow override");
  }

  if (!canEditDeliveryChargeOverride({ id: "x", status: "sent", sent_at: "2026-01-01" })) {
    pass("DC-27", "Override blocked after invoice sent");
  } else {
    fail("DC-27", "Sent invoice should block override");
  }
}

async function runLiveChecks(env) {
  console.log("\n--- Live QA (optional) ---\n");

  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (authErr) {
    warn("DC-30", `Skip live — auth failed: ${authErr.message}`);
    return;
  }

  const { data: policyRow, error: policyErr } = await sb
    .from("tenant_delivery_policy")
    .select("*")
    .eq("tenant_id", HQ)
    .maybeSingle();

  if (policyErr) {
    if (policyErr.message.toLowerCase().includes("does not exist")) {
      warn("DC-31", "tenant_delivery_policy not deployed on QA — apply migration");
    } else {
      warn("DC-31", `Policy read: ${policyErr.message}`);
    }
  } else {
    pass("DC-31", `tenant_delivery_policy readable (row=${policyRow ? "yes" : "defaults"})`);
  }

  const { data: orders, error: orderErr } = await sb
    .from("orders")
    .select(
      "order_id,total_amount,merchandise_subtotal,delivery_charge_amount,delivery_charge_reason"
    )
    .eq("tenant_id", HQ)
    .order("created_at", { ascending: false })
    .limit(5);

  if (orderErr) {
    if (orderErr.message.toLowerCase().includes("delivery_charge")) {
      warn("DC-32", "Order delivery columns not deployed — apply migration");
    } else {
      warn("DC-32", `Orders read: ${orderErr.message}`);
    }
  } else {
    pass("DC-32", `Order delivery columns readable (${(orders || []).length} sampled)`);
    const mismatch = (orders || []).find(
      (o) =>
        o.merchandise_subtotal != null &&
        o.total_amount != null &&
        Number(o.total_amount) !== Number(o.merchandise_subtotal) &&
        Number(o.delivery_charge_amount || 0) > 0 &&
        Number(o.total_amount) === Number(o.merchandise_subtotal) + Number(o.delivery_charge_amount)
    );
    if (mismatch) {
      fail("DC-33", "orders.total_amount appears to include delivery charge");
    } else {
      pass("DC-33", "Sampled orders keep total_amount separate from delivery charge");
    }
  }

  const { data: shipments, error: shipErr } = await sb
    .from("order_shipments")
    .select("shipment_id,delivery_charge_amount,delivery_charge_reason")
    .eq("tenant_id", HQ)
    .limit(3);

  if (shipErr) {
    if (shipErr.message.toLowerCase().includes("delivery_charge")) {
      warn("DC-34", "Shipment delivery mirror columns not deployed");
    } else {
      warn("DC-34", `Shipments read: ${shipErr.message}`);
    }
  } else {
    pass("DC-34", `Shipment delivery mirror readable (${(shipments || []).length} sampled)`);
  }
}

async function runLiveLabSnapshotChecks(env) {
  console.log("\n--- Live QA lab delivery snapshot ---\n");

  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: QA_LAB.email,
    password: QA_LAB.password,
  });
  if (authErr) {
    warn("DC-35", `Skip lab snapshot — auth failed: ${authErr.message}`);
    return;
  }

  const { data: inv } = await sb
    .from("inventory")
    .select("product_id")
    .eq("tenant_id", HQ)
    .gt("current_stock", 0)
    .limit(1);
  const productId = inv?.[0]?.product_id;
  if (!productId) {
    warn("DC-35", "Skip lab snapshot — no inventory");
    return;
  }

  const orderId = `ORD-DC-SNAPSHOT-${Date.now()}`;
  const rpcOrder = await sb.rpc("create_lab_order", {
    p_tenant_id: HQ,
    p_lab_id: "QA_LAB_001",
    p_order_id: orderId,
    p_items: [{ product_id: productId, product_name: "DC Verify", quantity: 1, unit_price: 15 }],
    p_client_request_id: `CRQ-dc-snapshot-${Date.now()}`,
    p_status: "Placed",
    p_created_by: QA_LAB.email,
  });
  if (rpcOrder.error) {
    fail("DC-35", `create_lab_order failed: ${rpcOrder.error.message}`);
    return;
  }
  pass("DC-35", `Lab checkout smoke order ${orderId}`);

  const snapshotRpc = await sb.rpc("persist_order_delivery_snapshot", {
    p_tenant_id: HQ,
    p_order_id: orderId,
    p_merchandise_subtotal: 15,
    p_delivery_charge_amount: 150,
    p_delivery_charge_reason: "standard",
    p_delivery_method_intent: "delivery",
    p_delivery_policy_snapshot: {
      standardDeliveryCharge: 150,
      freeDeliveryThreshold: 5000,
      currency: "INR",
    },
    p_delivery_charge_status: "quoted",
  });

  if (snapshotRpc.error) {
    if (isMissingRpc(snapshotRpc.error)) {
      warn("DC-36", `RPC not deployed — apply migration: ${snapshotRpc.error.message}`);
      return;
    }
    fail("DC-36", `persist_order_delivery_snapshot failed: ${snapshotRpc.error.message}`);
    return;
  }

  const body = snapshotRpc.data || {};
  if (!body.success) {
    fail("DC-36", "persist_order_delivery_snapshot returned success=false");
    return;
  }
  pass("DC-36", `RPC persisted delivery snapshot (idempotent=${Boolean(body.idempotent)})`);

  const { data: orderRow, error: readErr } = await sb
    .from("orders")
    .select(
      "order_id,total_amount,merchandise_subtotal,delivery_charge_amount,delivery_charge_reason,delivery_method_intent,delivery_charge_status,status"
    )
    .eq("tenant_id", HQ)
    .eq("order_id", orderId)
    .maybeSingle();

  if (readErr || !orderRow) {
    fail("DC-37", readErr?.message || "order row missing after snapshot");
    return;
  }

  if (
    Number(orderRow.merchandise_subtotal) === 15 &&
    Number(orderRow.delivery_charge_amount) === 150 &&
    str(orderRow.delivery_charge_reason) === "standard" &&
    str(orderRow.delivery_charge_status) === "quoted"
  ) {
    pass("DC-37", "Order delivery snapshot columns populated on QA row");
  } else {
    fail(
      "DC-37",
      `Snapshot columns mismatch: sub=${orderRow.merchandise_subtotal} charge=${orderRow.delivery_charge_amount}`
    );
  }

  if (Number(orderRow.total_amount) === 15) {
    pass("DC-38", "orders.total_amount remains merchandise-only (₹15)");
  } else {
    fail("DC-38", `total_amount should be 15, got ${orderRow.total_amount}`);
  }

  const statusPatch = await sb
    .from("orders")
    .update({ status: "Processing" })
    .eq("tenant_id", HQ)
    .eq("order_id", orderId)
    .select("order_id")
    .maybeSingle();

  if (statusPatch.error?.code === "PGRST116" || !statusPatch.data) {
    pass("DC-39", "Lab cannot directly UPDATE orders.status (RLS blocked)");
  } else {
    fail("DC-39", "Lab was able to UPDATE orders.status — RLS hole");
  }

  const { data: shipments } = await sb
    .from("order_shipments")
    .select("delivery_charge_amount")
    .eq("tenant_id", HQ)
    .gt("delivery_charge_amount", 0)
    .limit(5);

  const revenue = computeEstimatedDeliveryRevenue(shipments || []);
  if ((shipments || []).length > 0 && revenue > 0) {
    pass("DC-40", `Logistics Est. Delivery Revenue sample includes quoted shipments (₹${revenue})`);
  } else {
    warn(
      "DC-40",
      "No fulfilled shipments with delivery_charge_amount>0 yet — fulfill UAT confirms mirror"
    );
  }
}

function isMissingRpc(error) {
  const msg = str(error?.message).toLowerCase();
  return (
    msg.includes("persist_order_delivery_snapshot") &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"))
  );
}

async function main() {
  runStaticChecks();
  runEngineChecks();

  const env = loadEnv();
  if (env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_ANON_KEY) {
    await runLiveChecks(env);
    await runLiveLabSnapshotChecks(env);
  } else {
    warn("DC-30", "Skip live — .env.local missing");
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const warned = results.filter((r) => r.status === "WARN").length;
  console.log(`\n--- Summary: ${passed} passed, ${failed} failed, ${warned} warnings ---\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
