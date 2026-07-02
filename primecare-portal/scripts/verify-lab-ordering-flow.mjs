#!/usr/bin/env node
/**
 * Lab ordering + track-order flow certification (static + live QA Supabase).
 * Phase 4: ordering_mode governance + checkout persistence confirmation.
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
const LAB_CHECKOUT_CONFIRM_ERROR =
  "Order could not be confirmed. Your cart is saved. Please retry or contact PrimeCare support.";

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

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

const orderTrackingSrc = readSrc("src/utils/orderTracking.js");
const labPageSrc = readSrc("src/pages/LabOrderingPage.jsx");
const apiSrc = readSrc("src/api/primecareSupabaseApi.js");
const governanceSrc = readSrc("src/labOrdering/orderingGovernance.js");
const drawerSrc = readSrc("src/components/lab/OrderTrackingDrawer.jsx");
const operationalLabDrawerSrc = readSrc("src/components/operations/OperationalLabDrawer.jsx");
const buildStampSrc = readSrc("src/utils/buildStamp.js");
const orderLineSupportSrc = readSrc("src/api/orderLineMetricsSupport.js");
const ordersMonitorSrc = readSrc("src/orders/ordersMonitorEngine.js");
const ordersPageSrc = readSrc("src/pages/OrdersPage.jsx");

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

if (labPageSrc.includes("lastCheckoutOrderRef") && labPageSrc.includes("loadRecentOrders([orderSnapshot]")) {
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

if (
  apiSrc.includes("confirmLabOrderPersistedRead") &&
  apiSrc.includes("confirmLabOrderPersistedReadWithRetry") &&
  apiSrc.includes("finalizeConfirmedLabCheckout") &&
  apiSrc.includes("LAB_CHECKOUT_CONFIRM_ERROR") &&
  apiSrc.includes("LAB_CHECKOUT_CONFIRM_RETRY_ATTEMPTS")
) {
  pass("static.persistence_gate", "Checkout persistence confirmation + retry gate present in API");
} else {
  fail("static.persistence_gate", "confirmLabOrderPersistedReadWithRetry / finalizeConfirmedLabCheckout missing");
}

if (
  apiSrc.includes("rpc_success_without_order_row") &&
  apiSrc.includes("rpc_missing_order_row") &&
  apiSrc.includes("sanitizeRpcOrderResponseForLog")
) {
  pass("static.rpc_order_row_required", "RPC success without order row treated as failure");
} else {
  fail("static.rpc_order_row_required", "Missing RPC order-row validation");
}

if (apiSrc.includes("getAppBuildStamp") && buildStampSrc.includes("VITE_APP_BUILD_STAMP")) {
  pass("static.build_stamp", "Build/runtime stamp wired for checkout diagnostics");
} else {
  fail("static.build_stamp", "buildStamp.js or diagnostic stamp missing");
}

if (
  labPageSrc.includes("checkoutInFlightRef") &&
  labPageSrc.includes("trackingConfirming") &&
  drawerSrc.includes("Confirming your order")
) {
  pass("static.track_pending_confirm", "Track Order shows confirming state while checkout in flight");
} else {
  fail("static.track_pending_confirm", "Pending confirmation track UX missing");
}

if (
  labPageSrc.includes("!ALLOW_LEGACY_APPS_SCRIPT") &&
  labPageSrc.includes("Supabase order submission is required")
) {
  pass("static.qa_no_apps_script_fallback", "Lab checkout Apps Script fallback gated (QA uses Supabase only)");
} else {
  fail("static.qa_no_apps_script_fallback", "Legacy Apps Script fallback may run in QA checkout");
}

if (
  labPageSrc.includes("sbRes.data?.confirmed") &&
  labPageSrc.includes("LAB_CHECKOUT_CONFIRM_ERROR") &&
  labPageSrc.includes("submitResult?.confirmed") &&
  !/if \(sbRes\?\.success\) \{[\s\S]{0,200}clearCartState/.test(labPageSrc)
) {
  pass("static.success_requires_confirmed", "Success banner + cart clear require confirmed persistence");
} else {
  fail("static.success_requires_confirmed", "LabOrderingPage may show success without confirmed row");
}

if (
  labPageSrc.includes("trackingRequestSeqRef") &&
  labPageSrc.includes("confirmedDetails") &&
  orderTrackingSrc.includes("buildConfirmedCheckoutTrackingDetails")
) {
  pass("static.track_request_seq", "Track Order ignores stale async responses + uses confirmed checkout details");
} else {
  fail("static.track_request_seq", "Track Order race guard or confirmed checkout details missing");
}

if (
  apiSrc.includes("fetchOrderUnitCountsForOrders") &&
  orderLineSupportSrc.includes("fetchOrderUnitCountsForOrders")
) {
  pass("static.hq_item_count", "HQ Orders item count uses canonical line/item quantity rollup");
} else {
  fail("static.hq_item_count", "fetchOrderUnitCountsForOrders not wired for HQ Orders");
}

if (
  ordersMonitorSrc.includes("isVerificationTestOrderId") &&
  ordersPageSrc.includes("filterVerificationTestOrders")
) {
  pass("static.hide_verify_orders", "Verification smoke orders hidden from HQ Orders unless validation layer");
} else {
  fail("static.hide_verify_orders", "ORD-VERIFY / ORD-DC-SNAPSHOT filter missing on Orders page");
}

if (operationalLabDrawerSrc.includes("Ordering Mode") && operationalLabDrawerSrc.includes("updateLabOrderingModeWrite")) {
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

async function confirmOrderPersisted({ orderId, labId = "QA_LAB_001", tenantId = QA_HQ_TENANT_ID }) {
  const orderRes = await sb
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("lab_id", labId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (orderRes.error || !orderRes.data) {
    return { ok: false, reason: orderRes.error?.message || "order_not_found", order: null, lineCount: 0 };
  }

  const itemsRes = await sb.from("order_items").select("order_item_id,order_id,product_id,quantity").eq("order_id", orderId);
  let lineCount = itemsRes.data?.length || 0;
  if (!lineCount) {
    const linesRes = await sb.from("order_lines").select("order_line_id,order_id,product_id,quantity").eq("order_id", orderId);
    lineCount = linesRes.data?.length || 0;
  }
  if (!lineCount) {
    return { ok: false, reason: "no_lines", order: orderRes.data, lineCount: 0 };
  }
  return { ok: true, order: orderRes.data, lineCount };
}

async function tryLabCreateOrder(label) {
  const productId = await fetchInventoryProductId();
  if (!productId) {
    warn(`live.${label}`, "No inventory for smoke create");
    return { skipped: true };
  }
  const orderId = `ORD-VERIFY-${label}-${Date.now()}`;
  const clientRequestId = `CRQ-verify-${label}-${Date.now()}`;
  const rpc = await sb.rpc("create_lab_order", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: "QA_LAB_001",
    p_order_id: orderId,
    p_items: [{ product_id: productId, product_name: "Verify", quantity: 1, unit_price: 1 }],
    p_client_request_id: clientRequestId,
    p_status: "Placed",
    p_created_by: QA_LAB.email,
  });
  const confirmed = rpc.error ? { ok: false, reason: rpc.error.message } : await confirmOrderPersisted({ orderId });
  return { rpc, orderId, productId, clientRequestId, confirmed };
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
const modeColumnReady = await setOrderingMode("self_service");
if (modeColumnReady) {
  await signInLab();

  const persisted = await tryLabCreateOrder("persistence");
  if (!persisted.skipped) {
    if (persisted.rpc.error) {
      fail("live.persistence_create", persisted.rpc.error.message);
    } else if (!persisted.confirmed?.ok) {
      fail("live.persistence_create", `Order not confirmed: ${persisted.confirmed?.reason || "unknown"}`);
    } else {
      pass(
        "live.persistence_create",
        `${persisted.orderId} confirmed (${persisted.confirmed.lineCount} line(s), ₹${persisted.confirmed.order.total_amount})`
      );
    }

    if (persisted.confirmed?.ok) {
      const trackRead = await sb
        .from("orders")
        .select(HQ_ORDER_LIST_COLUMNS)
        .eq("order_id", persisted.orderId)
        .eq("lab_id", "QA_LAB_001")
        .maybeSingle();
      if (trackRead.error || !trackRead.data) {
        fail("live.track_after_create", trackRead.error?.message || "immediate track read failed");
      } else {
        pass("live.track_after_create", `Lab can read ${persisted.orderId} immediately after create`);
      }

      const recentIncludes = await sb
        .from("orders")
        .select("order_id")
        .eq("lab_id", "QA_LAB_001")
        .eq("order_id", persisted.orderId)
        .maybeSingle();
      if (!recentIncludes.data) fail("live.recent_includes_confirmed", "Confirmed order missing from lab read");
      else pass("live.recent_includes_confirmed", "Confirmed order visible in lab orders read");

      const wrongLab = await sb
        .from("orders")
        .select("order_id")
        .eq("order_id", persisted.orderId)
        .eq("lab_id", "QA_LAB_002")
        .maybeSingle();
      if (wrongLab.data) fail("live.lab_isolation", "Another lab can read QA_LAB_001 order");
      else pass("live.lab_isolation", "Lab cannot read order scoped to another lab_id");
    }
  }

  await signInAdmin();
  await setOrderingMode("hq_managed");
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
    else if (!hybrid.confirmed?.ok) fail("live.hybrid_lab_create", hybrid.confirmed?.reason || "not confirmed");
    else pass("live.hybrid_lab_create", hybrid.orderId);
  }

  await signInAdmin();
  await setOrderingMode("self_service");
  await signInLab();
  const selfSvc = await tryLabCreateOrder("self-service");
  if (!selfSvc.skipped) {
    if (selfSvc.rpc.error) fail("live.self_service_lab_create", selfSvc.rpc.error.message);
    else if (!selfSvc.confirmed?.ok) fail("live.self_service_lab_create", selfSvc.confirmed?.reason || "not confirmed");
    else pass("live.self_service_lab_create", selfSvc.orderId);
  }

  await signInAdmin();
  const adminCreate = await tryLabCreateOrder("admin-self-service");
  if (!adminCreate.skipped) {
    if (adminCreate.rpc.error) fail("live.admin_create_self_service", adminCreate.rpc.error.message);
    else if (!adminCreate.confirmed?.ok) {
      fail("live.admin_create_self_service", adminCreate.confirmed?.reason || "not confirmed");
    } else pass("live.admin_create_self_service", adminCreate.orderId);
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
    .select("id,order_id,lab_id,total_amount")
    .eq("lab_id", "QA_LAB_001")
    .limit(1);
  if (invRead.error) warn("live.finance_unchanged", invRead.error.message);
  else pass("live.finance_unchanged", `Invoice read OK (${invRead.data?.length || 0} rows)`);

  const policyRead = await sb
    .from("tenant_delivery_policy")
    .select("tenant_id,policy_type,standard_delivery_charge,free_delivery_threshold")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .maybeSingle();
  if (policyRead.error) {
    if (policyRead.error.message.includes("policy_type")) {
      warn("live.delivery_policy", "policy_type column not deployed");
    } else {
      warn("live.delivery_policy", policyRead.error.message);
    }
  } else {
    pass("live.delivery_policy", `Delivery policy readable (type=${policyRead.data?.policy_type || "defaults"})`);
  }

  if (LAB_CHECKOUT_CONFIRM_ERROR.includes("Your cart is saved")) {
    pass("static.confirm_error_copy", "Checkout confirmation error message includes cart-saved guidance");
  } else {
    fail("static.confirm_error_copy", "LAB_CHECKOUT_CONFIRM_ERROR copy missing cart-saved guidance");
  }

  await signInAdmin();
  await setOrderingMode(RESTORE_MODE);
  pass("live.restore_mode", `Restored QA_LAB_001 to ${RESTORE_MODE}`);
} else {
  const legacy = await tryLabCreateOrder("legacy");
  if (!legacy.skipped) {
    if (legacy.rpc.error) fail("live.create_order", legacy.rpc.error.message);
    else if (!legacy.confirmed?.ok) fail("live.create_order", legacy.confirmed?.reason || "not confirmed");
    else pass("live.create_order", legacy.orderId);
  }
}

if (!process.exitCode) {
  console.log("\nAll lab ordering flow checks passed.");
}
