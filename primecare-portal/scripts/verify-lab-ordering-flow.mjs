#!/usr/bin/env node
/**
 * Lab ordering + track-order flow certification (static + live QA Supabase).
 * Phase 4: ordering_mode governance checks.
 *
 * Usage:
 *   node scripts/verify-lab-ordering-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_LAB, QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const RESTORE_MODE = "self_service";

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
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

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

const orderTrackingSrc = readSrc("src/utils/orderTracking.js");
const labPageSrc = readSrc("src/pages/LabOrderingPage.jsx");
const apiSrc = readSrc("src/api/primecareSupabaseApi.js");
const governanceSrc = readSrc("src/labOrdering/orderingGovernance.js");
const drawerSrc = readSrc("src/components/operations/OperationalLabDrawer.jsx");

if (orderTrackingSrc.includes("getLabOrderDetailsRead")) {
  pass("static.lab_order_details_api", "orderTracking uses getLabOrderDetailsRead");
} else {
  fail("static.lab_order_details_api", "getLabOrderDetailsRead not wired in orderTracking");
}

if (orderTrackingSrc.includes("ALLOW_LEGACY_APPS_SCRIPT")) {
  pass("static.legacy_guard", "Apps Script fallback gated by ALLOW_LEGACY_APPS_SCRIPT");
} else {
  fail("static.legacy_guard", "Missing legacy Apps Script guard");
}

if (labPageSrc.includes("lastCheckoutOrderRef") && labPageSrc.includes("loadRecentOrders(orderSnapshot")) {
  pass("static.checkout_cache", "Checkout preserves order snapshot for tracking + recent orders merge");
} else {
  fail("static.checkout_cache", "Checkout cache/merge not found in LabOrderingPage");
}

if (apiSrc.includes("export async function getLabOrderDetailsRead")) {
  pass("static.lab_read_export", "getLabOrderDetailsRead exported");
} else {
  fail("static.lab_read_export", "getLabOrderDetailsRead missing");
}

if (governanceSrc.includes("hq_managed") && governanceSrc.includes("canLabInitiateOrder")) {
  pass("static.ordering_governance", "orderingGovernance module present");
} else {
  fail("static.ordering_governance", "orderingGovernance module incomplete");
}

if (labPageSrc.includes("getLabOrderingContextRead") && labPageSrc.includes("labCatalogOrderingDisabled")) {
  pass("static.lab_ordering_ui", "LabOrderingPage loads ordering mode + gates catalog");
} else {
  fail("static.lab_ordering_ui", "Lab ordering mode UI not wired");
}

if (apiSrc.includes("assertLabOrderInitiationAllowed") && apiSrc.includes("updateLabOrderingModeWrite")) {
  pass("static.create_order_gate", "createOrderWrite ordering initiation gate present");
} else {
  fail("static.create_order_gate", "createOrderWrite ordering gate missing");
}

if (drawerSrc.includes("Ordering Mode") && drawerSrc.includes("updateLabOrderingModeWrite")) {
  pass("static.admin_ordering_mode", "OperationalLabDrawer ordering mode editor");
} else {
  fail("static.admin_ordering_mode", "Admin ordering mode UI missing");
}

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const HQ_ORDER_LIST_COLUMNS =
  "id,order_id,lab_id,status,order_date,created_at,total_amount,tenant_id,created_by,notes,agent_id,inventory_updated,fulfilled_at,invoice_id";

async function signInLab() {
  const { error } = await sb.auth.signInWithPassword({
    email: QA_LAB.email,
    password: QA_LAB.password,
  });
  if (error) fail("live.auth", error.message);
  else pass("live.auth", `Signed in as ${QA_LAB.email}`);
}

async function signInAdmin() {
  await sb.auth.signOut();
  const { error } = await sb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (error) fail("live.admin_auth", error.message);
  else pass("live.admin_auth", `Signed in as ${QA_ADMIN.email}`);
}

async function setOrderingMode(mode) {
  const { error } = await sb
    .from("labs")
    .update({ ordering_mode: mode })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", "QA_LAB_001");
  if (error) {
    if (error.message.includes("ordering_mode")) {
      warn("live.ordering_mode_column", "ordering_mode not deployed — apply migration");
      return false;
    }
    throw new Error(error.message);
  }
  return true;
}

async function fetchInventoryProductId() {
  const inv = await sb
    .from("inventory")
    .select("product_id,current_stock")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .gt("current_stock", 0)
    .limit(1);
  return inv.data?.[0]?.product_id || null;
}

async function tryLabCreateOrder(label) {
  const productId = await fetchInventoryProductId();
  if (!productId) {
    warn(`live.${label}`, "No inventory for smoke create");
    return { skipped: true };
  }
  const orderId = `ORD-VERIFY-${label}-${Date.now()}`;
  const rpc = await sb.rpc("create_lab_order", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: "QA_LAB_001",
    p_order_id: orderId,
    p_items: [{ product_id: productId, product_name: "Verify", quantity: 1, unit_price: 1 }],
    p_client_request_id: `CRQ-verify-${label}-${Date.now()}`,
    p_status: "Placed",
    p_created_by: QA_LAB.email,
  });
  return { rpc, orderId, productId };
}

await signInLab();

const recent = await sb
  .from("orders")
  .select(HQ_ORDER_LIST_COLUMNS)
  .eq("lab_id", "QA_LAB_001")
  .order("created_at", { ascending: false })
  .limit(1);

if (recent.error) fail("live.recent_orders", recent.error.message);
else if (!recent.data?.[0]) warn("live.recent_orders", "No lab orders in QA yet");
else {
  const row = recent.data[0];
  pass("live.recent_orders", `Found ${row.order_id}`);

  const byBusiness = await sb
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .eq("order_id", row.order_id)
    .eq("lab_id", "QA_LAB_001")
    .maybeSingle();
  if (byBusiness.error || !byBusiness.data) {
    fail("live.track_by_order_id", byBusiness.error?.message || "lookup failed");
  } else {
    pass("live.track_by_order_id", `Readable by order_id (${row.order_id})`);
  }

  if (row.id) {
    const byUuid = await sb
      .from("orders")
      .select(HQ_ORDER_LIST_COLUMNS)
      .eq("id", row.id)
      .eq("lab_id", "QA_LAB_001")
      .maybeSingle();
    if (byUuid.error || !byUuid.data) {
      fail("live.track_by_uuid", byUuid.error?.message || "uuid lookup failed");
    } else {
      pass("live.track_by_uuid", `Readable by id (${row.id})`);
    }
  }
}

await signInAdmin();
const modeColumnReady = await setOrderingMode("hq_managed");
if (modeColumnReady) {
  await signInLab();

  const hqBlocked = await tryLabCreateOrder("hq-managed");
  if (!hqBlocked.skipped) {
    if (hqBlocked.rpc.error?.message?.includes("lab_ordering_blocked")) {
      pass("live.hq_managed_lab_blocked", "Lab create blocked under hq_managed");
    } else if (hqBlocked.rpc.error) {
      fail("live.hq_managed_lab_blocked", hqBlocked.rpc.error.message);
    } else {
      fail("live.hq_managed_lab_blocked", "Expected lab_ordering_blocked");
    }
  }

  const trackWhileManaged = await sb
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .eq("lab_id", "QA_LAB_001")
    .limit(1);
  if (trackWhileManaged.error) fail("live.track_while_hq_managed", trackWhileManaged.error.message);
  else pass("live.track_while_hq_managed", "Track/read orders still works under hq_managed");

  await signInAdmin();
  await setOrderingMode("hybrid");
  await signInLab();
  const hybrid = await tryLabCreateOrder("hybrid");
  if (!hybrid.skipped) {
    if (hybrid.rpc.error) fail("live.hybrid_lab_create", hybrid.rpc.error.message);
    else pass("live.hybrid_lab_create", hybrid.orderId);
  }

  await signInAdmin();
  await setOrderingMode("self_service");
  await signInLab();
  const selfSvc = await tryLabCreateOrder("self-service");
  if (!selfSvc.skipped) {
    if (selfSvc.rpc.error) fail("live.self_service_lab_create", selfSvc.rpc.error.message);
    else pass("live.self_service_lab_create", selfSvc.orderId);
  }

  await signInAdmin();
  const adminCreate = await tryLabCreateOrder("admin-self-service");
  if (!adminCreate.skipped) {
    if (adminCreate.rpc.error) fail("live.admin_create_self_service", adminCreate.rpc.error.message);
    else pass("live.admin_create_self_service", adminCreate.orderId);
  }

  await setOrderingMode("suspended");
  await signInLab();
  const suspended = await tryLabCreateOrder("suspended");
  if (!suspended.skipped) {
    if (suspended.rpc.error?.message?.includes("lab_ordering_blocked")) {
      pass("live.suspended_lab_blocked", "Lab create blocked when suspended");
    } else if (suspended.rpc.error) {
      fail("live.suspended_lab_blocked", suspended.rpc.error.message);
    } else {
      fail("live.suspended_lab_blocked", "Expected lab_ordering_blocked");
    }
  }

  const invRead = await sb
    .from("invoices")
    .select("id,invoice_id,lab_id,total_amount")
    .eq("lab_id", "QA_LAB_001")
    .limit(1);
  if (invRead.error) warn("live.finance_unchanged", invRead.error.message);
  else pass("live.finance_unchanged", `Invoice read OK (${invRead.data?.length || 0} rows)`);

  const policyRead = await sb.from("tenant_delivery_policy").select("tenant_id,policy_type,standard_delivery_charge,free_delivery_threshold").eq("tenant_id", QA_HQ_TENANT_ID).maybeSingle();
  if (policyRead.error) {
    if (policyRead.error.message.includes("policy_type")) {
      warn("live.delivery_policy", "policy_type column not deployed");
    } else {
      warn("live.delivery_policy", policyRead.error.message);
    }
  } else {
    pass("live.delivery_policy", `Delivery policy readable (type=${policyRead.data?.policy_type || "defaults"})`);
  }

  await signInAdmin();
  await setOrderingMode(RESTORE_MODE);
  pass("live.restore_mode", `Restored QA_LAB_001 to ${RESTORE_MODE}`);
} else {
  const legacy = await tryLabCreateOrder("legacy");
  if (!legacy.skipped) {
    if (legacy.rpc.error) fail("live.create_order", legacy.rpc.error.message);
    else pass("live.create_order", legacy.orderId);
  }
}

if (!process.exitCode) {
  console.log("\nAll lab ordering flow checks passed.");
}
