#!/usr/bin/env node
/**
 * Lab ordering + track-order flow certification (static + live QA Supabase).
 *
 * Usage:
 *   node scripts/verify-lab-ordering-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_LAB, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
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

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { error: authErr } = await sb.auth.signInWithPassword({
  email: QA_LAB.email,
  password: QA_LAB.password,
});
if (authErr) fail("live.auth", authErr.message);
else pass("live.auth", `Signed in as ${QA_LAB.email}`);

const HQ_ORDER_LIST_COLUMNS =
  "id,order_id,lab_id,status,order_date,created_at,total_amount,tenant_id,created_by,notes,agent_id,inventory_updated,fulfilled_at,invoice_id";

const recent = await sb
  .from("orders")
  .select(HQ_ORDER_LIST_COLUMNS)
  .eq("lab_id", "QA_LAB_001")
  .order("created_at", { ascending: false })
  .limit(1);

if (recent.error) fail("live.recent_orders", recent.error.message);
else if (!recent.data?.[0]) fail("live.recent_orders", "No lab orders in QA");
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

  const inv = await sb
    .from("inventory")
    .select("product_id,current_stock")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .gt("current_stock", 0)
    .limit(1);
  const productId = inv.data?.[0]?.product_id;
  if (!productId) fail("live.create_order", "No inventory for smoke create");
  else {
    const orderId = `ORD-VERIFY-TRACK-${Date.now()}`;
    const rpc = await sb.rpc("create_lab_order", {
      p_tenant_id: QA_HQ_TENANT_ID,
      p_lab_id: "QA_LAB_001",
      p_order_id: orderId,
      p_items: [{ product_id: productId, product_name: "Verify", quantity: 1, unit_price: 1 }],
      p_client_request_id: `CRQ-verify-${Date.now()}`,
      p_status: "Placed",
      p_created_by: QA_LAB.email,
    });
    if (rpc.error) fail("live.create_order", rpc.error.message);
    else {
      pass("live.create_order", orderId);
      const read = await sb
        .from("orders")
        .select(HQ_ORDER_LIST_COLUMNS)
        .eq("order_id", orderId)
        .eq("lab_id", "QA_LAB_001")
        .maybeSingle();
      if (read.error || !read.data) fail("live.immediate_read", read.error?.message || "missing");
      else pass("live.immediate_read", "Lab can read order immediately after checkout RPC");
    }
  }
}

if (!process.exitCode) {
  console.log("\nAll lab ordering flow checks passed.");
}
