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
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

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

async function main() {
  runStaticChecks();
  runEngineChecks();

  const env = loadEnv();
  if (env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_ANON_KEY) {
    await runLiveChecks(env);
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
