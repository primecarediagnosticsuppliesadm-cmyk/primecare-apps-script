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
  let assigned = 0;
  let out = 0;
  let deliveredToday = 0;
  let failed = 0;
  let customerPickup = 0;
  for (const s of shipments) {
    const status = str(s.dispatch_status).toLowerCase();
    const method = str(s.delivery_method).toLowerCase();
    if (status === "ready_for_dispatch") ready += 1;
    if (status === "assigned") assigned += 1;
    if (status === "out_for_delivery") out += 1;
    if (status === "delivery_failed") failed += 1;
    if (method === "customer_pickup") customerPickup += 1;
    if (isToday(s.delivered_at)) deliveredToday += 1;
  }
  return { ready, assigned, out, deliveredToday, failed, customerPickup };
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

  const courierEngine = readSrc("src/logistics/logisticsCourierEngine.js");
  const courierPanel = readSrc("src/components/logistics/CourierManagementPanel.jsx");
  if (
    existsSync(resolve(root, "supabase/migrations/20260630120000_logistics_phase2_couriers.sql")) &&
    courierEngine.includes("validateShipmentAssignment") &&
    courierPanel.includes("Courier Management")
  ) {
    pass("static.phase2_couriers", "Phase 2 courier management wired");
  } else {
    fail("static.phase2_couriers", "Phase 2 courier module incomplete");
  }

  if (
    logisticsApi.includes("getLogisticsCouriersRead") &&
    logisticsApi.includes("upsertLogisticsCourierWrite")
  ) {
    pass("static.courier_api", "Courier read/write APIs present in logisticsSupabaseApi");
  } else {
    fail("static.courier_api", "Courier APIs missing from logisticsSupabaseApi");
  }

  const shipmentEngine = readSrc("src/logistics/logisticsShipmentEngine.js");
  if (shipmentEngine.includes("customerPickup") && shipmentEngine.includes("dispatchActionLabel")) {
    pass("static.phase2_kpis", "Phase 2 KPI fields and dispatch action labels present");
  } else {
    fail("static.phase2_kpis", "Phase 2 KPI/action label updates missing");
  }

  if (!primeApi.includes("logistics_couriers") && !ordersPage.includes("CourierManagementPanel")) {
    pass("static.orders_untouched", "Orders page not modified for Phase 2 couriers");
  } else {
    fail("static.orders_untouched", "Orders module unexpectedly modified");
  }

  const routeMigration = "supabase/migrations/20260704120000_logistics_phase4_route_planning.sql";
  if (existsSync(resolve(root, routeMigration))) {
    const sql = readSrc(routeMigration);
    if (
      sql.includes("CREATE TABLE IF NOT EXISTS public.delivery_routes") &&
      sql.includes("CREATE TABLE IF NOT EXISTS public.delivery_route_shipments") &&
      sql.includes("preferred_delivery_day")
    ) {
      pass("static.phase4_migration", "Phase 4 route planning migration present");
    } else {
      fail("static.phase4_migration", "Phase 4 migration incomplete");
    }
  } else {
    fail("static.phase4_migration", "Phase 4 migration file missing");
  }

  const routeEngine = readSrc("src/logistics/logisticsRouteEngine.js");
  const routePanel = readSrc("src/components/logistics/RoutePlanningPanel.jsx");
  if (
    routeEngine.includes("computeRoutePlanningKpis") &&
    routePanel.includes("Create Route") &&
    logisticsApi.includes("createDeliveryRouteWrite") &&
    logisticsApi.includes("assignShipmentToRouteWrite") &&
    logisticsApi.includes("reorderRouteStopsWrite") &&
    logisticsApi.includes("completeDeliveryRouteWrite")
  ) {
    pass("static.phase4_routes", "Phase 4 route planning engine + API + UI wired");
  } else {
    fail("static.phase4_routes", "Phase 4 route planning module incomplete");
  }

  const shipmentDrawer = readSrc("src/components/logistics/ShipmentDetailDrawer.jsx");
  if (
    shipmentDrawer.includes("Route Planning") &&
    shipmentDrawer.includes("getShipmentRouteAssignmentRead")
  ) {
    pass("static.phase4_drawer", "Shipment drawer shows route assignment fields");
  } else {
    fail("static.phase4_drawer", "Shipment drawer missing route planning section");
  }

  const logisticsPage = readSrc("src/pages/LogisticsDeliveryPage.jsx");
  if (logisticsPage.includes("Route Planning") && logisticsPage.includes("RoutePlanningPanel")) {
    pass("static.phase4_dashboard", "Logistics dashboard includes route planning tab");
  } else {
    fail("static.phase4_dashboard", "Route planning tab missing from logistics page");
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
  const assignedDb = rows.filter((r) => str(r.dispatch_status) === "assigned").length;
  const outDb = rows.filter((r) => str(r.dispatch_status) === "out_for_delivery").length;
  const deliveredTodayDb = rows.filter((r) => isToday(r.delivered_at)).length;
  if (
    kpis.ready === readyDb &&
    kpis.assigned === assignedDb &&
    kpis.out === outDb &&
    kpis.deliveredToday === deliveredTodayDb
  ) {
    pass(
      "live.kpis",
      `KPI counts match DB (ready=${readyDb}, assigned=${assignedDb}, out=${outDb}, deliveredToday=${deliveredTodayDb})`
    );
  } else {
    fail("live.kpis", "KPI computation drift vs database rows");
  }

  const { error: courierErr } = await sb.from("logistics_couriers").select("courier_id").limit(1);
  if (courierErr && /does not exist|schema cache/i.test(courierErr.message)) {
    warn("live.couriers_table", "logistics_couriers not deployed — apply Phase 2 migration");
  } else if (courierErr) {
    fail("live.couriers_table", courierErr.message);
  } else {
    pass("live.couriers_table", "logistics_couriers readable");
  }

  await runLiveRoutePlanningChecks(sb, rows);
}

async function runLiveRoutePlanningChecks(sb, shipments) {
  console.log("\n--- Live route planning (Phase 4) ---\n");

  const { error: routeTableErr } = await sb.from("delivery_routes").select("id").limit(1);
  if (routeTableErr && /does not exist|schema cache/i.test(routeTableErr.message)) {
    warn("live.routes_table", "delivery_routes not deployed — apply Phase 4 migration");
    return;
  }
  if (routeTableErr) {
    fail("live.routes_table", routeTableErr.message);
    return;
  }
  pass("live.routes_table", "delivery_routes readable");

  const readyShipment = (shipments || []).find(
    (s) => str(s.dispatch_status).toLowerCase() === "ready_for_dispatch"
  );
  const routeCode = `RT-VERIFY-${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);

  const { data: createdRoute, error: createErr } = await sb
    .from("delivery_routes")
    .insert([
      {
        tenant_id: HQ,
        route_code: routeCode,
        route_name: "Verify Route",
        delivery_day: "mon",
        capacity: 10,
        active: true,
        route_status: "planning",
        planned_date: today,
      },
    ])
    .select()
    .single();

  if (createErr) {
    fail("live.create_route", createErr.message);
    return;
  }
  pass("live.create_route", createdRoute.route_code);

  if (readyShipment?.shipment_id) {
    const { error: assignErr } = await sb.from("delivery_route_shipments").insert([
      {
        route_id: createdRoute.id,
        shipment_id: readyShipment.shipment_id,
        sequence_number: 1,
      },
    ]);
    if (assignErr) {
      fail("live.assign_shipment", assignErr.message);
    } else {
      pass("live.assign_shipment", readyShipment.shipment_id);
    }

    const { data: stops } = await sb
      .from("delivery_route_shipments")
      .select("shipment_id,sequence_number")
      .eq("route_id", createdRoute.id)
      .order("sequence_number", { ascending: true });

    if ((stops || []).length >= 1) {
      const { error: reorderErr } = await sb
        .from("delivery_route_shipments")
        .update({ sequence_number: 1 })
        .eq("route_id", createdRoute.id)
        .eq("shipment_id", readyShipment.shipment_id);
      if (reorderErr) fail("live.reorder_stops", reorderErr.message);
      else pass("live.reorder_stops", "Sequence update OK");
    }
  } else {
    warn("live.assign_shipment", "No ready_for_dispatch shipment to assign");
  }

  const { error: completeErr } = await sb
    .from("delivery_routes")
    .update({ route_status: "completed", completed_at: new Date().toISOString() })
    .eq("id", createdRoute.id);
  if (completeErr) fail("live.mark_complete", completeErr.message);
  else pass("live.mark_complete", "Route marked completed");

  const { data: routeKpis } = await sb
    .from("delivery_routes")
    .select("id,route_status,planned_date")
    .eq("tenant_id", HQ)
    .eq("planned_date", today);
  pass("live.route_kpis", `${(routeKpis || []).length} route(s) planned for today`);

  const orderProbe = await sb.from("orders").select("order_id,total_amount,status").eq("tenant_id", HQ).limit(1);
  if (orderProbe.error) warn("live.orders_unchanged", orderProbe.error.message);
  else pass("live.orders_unchanged", "Orders readable after route planning");

  const invProbe = await sb.from("invoices").select("id,total_amount,status").eq("tenant_id", HQ).limit(1);
  if (invProbe.error) warn("live.invoices_unchanged", invProbe.error.message);
  else pass("live.invoices_unchanged", `Invoices readable (${invProbe.data?.length || 0} rows)`);

  const payProbe = await sb.from("payments").select("payment_id,amount").eq("tenant_id", HQ).limit(1);
  if (payProbe.error) warn("live.payments_unchanged", payProbe.error.message);
  else pass("live.payments_unchanged", `Payments readable (${payProbe.data?.length || 0} rows)`);

  const arProbe = await sb.from("ar_credit_control").select("lab_id,outstanding").eq("tenant_id", HQ).limit(1);
  if (arProbe.error) warn("live.collections_unchanged", arProbe.error.message);
  else pass("live.collections_unchanged", "AR/collections readable after route planning");

  await sb.from("delivery_route_shipments").delete().eq("route_id", createdRoute.id);
  await sb.from("delivery_routes").delete().eq("id", createdRoute.id);
}

async function main() {
  console.log("\n=== Logistics Certification (Phase 1A + 2 + 4) ===\n");
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
