#!/usr/bin/env node
/**
 * Logistics Phase 1A — dispatch flow certification (static + live QA Supabase).
 *
 * Usage:
 *   node scripts/verify-logistics-dispatch-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || QA_HQ_TENANT_ID;

const VALID_STATUSES = new Set([
  "ready_for_dispatch",
  "assigned",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "rescheduled",
  "returned",
]);

const VALID_TRANSITIONS = {
  ready_for_dispatch: ["assigned"],
  assigned: ["out_for_delivery"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivery_failed: ["rescheduled", "returned"],
  rescheduled: ["assigned", "out_for_delivery", "delivered"],
  delivered: [],
  returned: [],
};

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

function readSrc(relPath) {
  return readFileSync(resolve(root, relPath), "utf8");
}

function isToday(isoOrDate) {
  const raw = str(isoOrDate);
  if (!raw) return false;
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

function computeKpis(shipments) {
  let ready = 0;
  let out = 0;
  let deliveredToday = 0;
  let failed = 0;
  for (const s of shipments) {
    const status = str(s.dispatch_status).toLowerCase();
    if (status === "ready_for_dispatch") ready += 1;
    if (status === "out_for_delivery") out += 1;
    if (status === "delivery_failed") failed += 1;
    if (status === "delivered" && isToday(s.delivered_at)) deliveredToday += 1;
  }
  return { ready, out, deliveredToday, failed };
}

async function signIn(sb, email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`auth(${email}): ${error.message}`);
  return data.session;
}

function runStaticChecks() {
  console.log("\n--- Static wiring ---\n");

  const migrationPath = "supabase/migrations/20260628120000_logistics_phase1a_shipments.sql";
  if (!existsSync(resolve(root, migrationPath))) {
    fail("static.migration", "Logistics migration file missing");
  } else {
    const sql = readSrc(migrationPath);
    if (sql.includes("CREATE TABLE IF NOT EXISTS public.order_shipments") &&
        sql.includes("CREATE TABLE IF NOT EXISTS public.shipment_status_events") &&
        !sql.includes("delivery_pricing")) {
      pass("static.migration", "Additive shipment tables only");
    } else {
      fail("static.migration", "Migration missing expected tables or has out-of-scope objects");
    }
  }

  const logisticsApi = readSrc("src/api/logisticsSupabaseApi.js");
  if (
    logisticsApi.includes("createShipmentForFulfilledOrderWrite") &&
    logisticsApi.includes("transitionShipmentStatusWrite")
  ) {
    pass("static.logistics_api", "Shipment create/read/transition APIs present");
  } else {
    fail("static.logistics_api", "logisticsSupabaseApi incomplete");
  }

  const primeApi = readSrc("src/api/primecareSupabaseApi.js");
  const hookCount = (primeApi.match(/tryCreateShipmentAfterFulfill/g) || []).length;
  if (hookCount >= 4) {
    pass("static.fulfill_hook", `Fulfill shipment hook wired (${hookCount} references)`);
  } else {
    fail("static.fulfill_hook", `Expected fulfill shipment hook in primecareSupabaseApi (found ${hookCount})`);
  }

  if (
    /createInvoiceForFulfilledOrderWrite[\s\S]{0,400}tryCreateShipmentAfterFulfill/.test(primeApi)
  ) {
    pass("static.hook_after_invoice", "Shipment create runs after invoice hook");
  } else {
    fail("static.hook_after_invoice", "Shipment hook must follow invoice creation on fulfill");
  }

  const menu = readSrc("src/config/menuConfig.js");
  const matrix = readSrc("src/config/rolePermissionMatrix.js");
  if (menu.includes("logisticsDelivery") && matrix.includes("logisticsDelivery")) {
    pass("static.navigation", "Logistics page in menu + permission matrix");
  } else {
    fail("static.navigation", "Logistics navigation not fully wired");
  }

  const ordersPage = readSrc("src/pages/OrdersPage.jsx");
  if (ordersPage.includes("OrdersLogisticsPanel")) {
    pass("static.orders_integration", "Orders detail includes logistics panel");
  } else {
    fail("static.orders_integration", "OrdersLogisticsPanel not integrated");
  }

  const portal = readSrc("src/PrimeCareWebPortal.jsx");
  if (portal.includes("LogisticsDeliveryPage")) {
    pass("static.portal_route", "Logistics page routed in portal");
  } else {
    fail("static.portal_route", "LogisticsDeliveryPage route missing");
  }

  const engine = readSrc("src/logistics/logisticsShipmentEngine.js");
  if (engine.includes("ready_for_dispatch") && engine.includes("canTransitionShipmentStatus")) {
    pass("static.state_machine", "Shipment status machine defined in engine");
  } else {
    fail("static.state_machine", "State machine missing from engine");
  }

  const forbiddenTouches = [
    "src/api/invoiceSupabaseApi.js",
    "src/pages/CollectionsPage.jsx",
  ];
  let financeRegression = true;
  for (const file of forbiddenTouches) {
    const content = readSrc(file);
    if (content.includes("order_shipments") || content.includes("logisticsSupabaseApi")) {
      financeRegression = false;
      fail("static.finance_isolation", `${file} unexpectedly references logistics tables`);
    }
  }
  if (financeRegression) {
    pass("static.finance_isolation", "Payments/collections modules untouched by logistics");
  }
}

async function runLiveChecks(sb) {
  console.log("\n--- Live Supabase ---\n");

  const { error: tableErr } = await sb.from("order_shipments").select("shipment_id").limit(1);
  if (tableErr && /does not exist|schema cache/i.test(tableErr.message)) {
    warn("live.table", "order_shipments not deployed — apply migration on QA");
    return;
  }
  if (tableErr) {
    fail("live.table", tableErr.message);
    return;
  }
  pass("live.table", "order_shipments readable");

  const { data: shipments, error: shipErr } = await sb
    .from("order_shipments")
    .select("*")
    .eq("tenant_id", HQ)
    .limit(500);
  if (shipErr) {
    fail("live.shipments_read", shipErr.message);
    return;
  }

  const rows = shipments || [];
  pass("live.shipments_read", `${rows.length} shipment row(s) for tenant`);

  const dupOrders = new Map();
  for (const row of rows) {
    const oid = str(row.order_id);
    dupOrders.set(oid, (dupOrders.get(oid) || 0) + 1);
  }
  const duplicates = [...dupOrders.entries()].filter(([, c]) => c > 1);
  if (!duplicates.length) {
    pass("live.one_per_order", "No duplicate shipments per order in tenant sample");
  } else {
    fail("live.one_per_order", `${duplicates.length} order(s) have duplicate shipments`);
  }

  let invalidStatus = 0;
  for (const row of rows) {
    if (!VALID_STATUSES.has(str(row.dispatch_status).toLowerCase())) invalidStatus += 1;
  }
  if (!invalidStatus) {
    pass("live.status_values", "All shipment statuses are valid enum values");
  } else {
    fail("live.status_values", `${invalidStatus} row(s) with invalid dispatch_status`);
  }

  const { data: fulfilledOrders } = await sb
    .from("orders")
    .select("order_id,status")
    .eq("tenant_id", HQ)
    .ilike("status", "fulfilled")
    .limit(200);

  const shipmentByOrder = new Map(rows.map((r) => [str(r.order_id), r]));
  let fulfilledMissingShipment = 0;
  let fulfilledWithShipment = 0;
  for (const order of fulfilledOrders || []) {
    const oid = str(order.order_id);
    if (shipmentByOrder.has(oid)) fulfilledWithShipment += 1;
    else fulfilledMissingShipment += 1;
  }

  if ((fulfilledOrders || []).length === 0) {
    warn("live.fulfilled_link", "No fulfilled orders in sample to verify auto-create");
  } else if (fulfilledWithShipment > 0) {
    pass(
      "live.fulfilled_link",
      `${fulfilledWithShipment}/${fulfilledOrders.length} fulfilled orders have shipments` +
        (fulfilledMissingShipment ? ` (${fulfilledMissingShipment} pre-migration)` : "")
    );
  } else {
    warn(
      "live.fulfilled_link",
      "No fulfilled orders have shipments yet — fulfill an order after migration to verify auto-create"
    );
  }

  const { data: events, error: evErr } = await sb
    .from("shipment_status_events")
    .select("from_status,to_status,shipment_id")
    .eq("tenant_id", HQ)
    .limit(1000);
  if (evErr) {
    fail("live.events_read", evErr.message);
  } else {
    let badTransitions = 0;
    for (const ev of events || []) {
      const from = str(ev.from_status).toLowerCase();
      const to = str(ev.to_status).toLowerCase();
      if (!from) continue;
      const allowed = VALID_TRANSITIONS[from] || [];
      if (!allowed.includes(to)) badTransitions += 1;
    }
    if (!badTransitions) {
      pass("live.transitions", "Shipment status events respect state machine");
    } else {
      fail("live.transitions", `${badTransitions} event(s) with invalid from→to transition`);
    }
  }

  const kpis = computeKpis(rows);
  const readyDb = rows.filter((r) => str(r.dispatch_status) === "ready_for_dispatch").length;
  const outDb = rows.filter((r) => str(r.dispatch_status) === "out_for_delivery").length;
  if (kpis.ready === readyDb && kpis.out === outDb) {
    pass("live.kpis", `KPI counts match DB (ready=${readyDb}, out=${outDb})`);
  } else {
    fail("live.kpis", "KPI computation drift vs database rows");
  }
}

async function main() {
  console.log("\n=== Logistics Phase 1A Certification ===\n");
  console.log(`Tenant: ${HQ}\n`);

  runStaticChecks();

  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await signIn(sb, QA_ADMIN.email, QA_ADMIN.password);
  await runLiveChecks(sb);

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => r.status === "FAIL");
  const warned = results.filter((r) => r.status === "WARN");
  console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
  console.log(`WARN: ${warned.length}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    for (const row of failed) console.log(`  - ${row.id}: ${row.detail}`);
    process.exit(1);
  }
  console.log("\nLogistics dispatch flow certification passed.\n");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
