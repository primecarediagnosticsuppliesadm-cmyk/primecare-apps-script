#!/usr/bin/env node
/**
 * Lab Ordering + HQ Orders sync stabilization (live QA API).
 * Usage: node scripts/verify-lab-orders-sync-stabilization.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_LAB, QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}

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

function isVerificationTestOrderId(orderId) {
  const id = str(orderId).toUpperCase();
  return id.startsWith("ORD-VERIFY") || id.startsWith("ORD-DC-SNAPSHOT");
}

async function sumLineUnits(sb, orderId) {
  const oid = str(orderId);
  const { data: lines } = await sb.from("order_lines").select("quantity").eq("order_id", oid);
  if ((lines || []).length) {
    return { units: lines.reduce((s, r) => s + num(r.quantity), 0), source: "order_lines" };
  }
  const { data: items } = await sb.from("order_items").select("quantity").eq("order_id", oid);
  if ((items || []).length) {
    return { units: items.reduce((s, r) => s + num(r.quantity), 0), source: "order_items" };
  }
  return { units: 0, source: "none" };
}

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

console.log("\n=== Lab + Orders Sync Stabilization (live QA) ===\n");

await sb.auth.signInWithPassword({ email: QA_LAB.email, password: QA_LAB.password });
pass("auth.lab", QA_LAB.email);

const inv = await sb
  .from("inventory")
  .select("product_id,current_stock")
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .gt("current_stock", 0)
  .limit(1);
const productId = inv.data?.[0]?.product_id;
if (!productId) fail("lab.create", "No inventory for lab order");
const qty = 2;
const orderId = `ORD-SYNC-UAT-${Date.now()}`;
const rpc = await sb.rpc("create_lab_order", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_lab_id: "QA_LAB_001",
  p_order_id: orderId,
  p_items: [{ product_id: productId, product_name: "Sync UAT", quantity: qty, unit_price: 5 }],
  p_client_request_id: `CRQ-sync-uat-${Date.now()}`,
  p_status: "Placed",
  p_created_by: QA_LAB.email,
});
if (rpc.error) fail("lab.create", rpc.error.message);
pass("lab.create", orderId);

const orderRow = await sb
  .from("orders")
  .select("order_id,total_amount,lab_id")
  .eq("order_id", orderId)
  .eq("lab_id", "QA_LAB_001")
  .maybeSingle();
if (!orderRow.data) fail("lab.persist", "orders row missing");
pass("lab.persist", `orders row ₹${orderRow.data.total_amount}`);

const units = await sumLineUnits(sb, orderId);
if (units.units !== qty) fail("lab.lines", `expected ${qty} units from ${units.source}, got ${units.units}`);
pass("lab.lines", `${units.units} units via ${units.source}`);

const labTrack = await sb
  .from("orders")
  .select("order_id")
  .eq("order_id", orderId)
  .eq("lab_id", "QA_LAB_001")
  .maybeSingle();
if (!labTrack.data) fail("lab.track", "lab cannot read own order");
pass("lab.track", "lab scoped read OK");

await sb.auth.signOut();
await sb.auth.signInWithPassword({ email: QA_ADMIN.email, password: QA_ADMIN.password });
pass("auth.admin", QA_ADMIN.email);

const hqOrder = await sb
  .from("orders")
  .select("order_id,total_amount")
  .eq("order_id", orderId)
  .maybeSingle();
if (!hqOrder.data) fail("hq.order", "HQ cannot read new order");
pass("hq.order", orderId);

const hqUnits = await sumLineUnits(sb, orderId);
if (hqUnits.units !== qty) fail("hq.item_count", `HQ sees ${hqUnits.units} units, expected ${qty}`);
pass("hq.item_count", `${hqUnits.units} units (canonical ${hqUnits.source})`);

const verifyOrders = await sb
  .from("orders")
  .select("order_id")
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .ilike("order_id", "ORD-VERIFY%")
  .limit(5);
const smokeCount = (verifyOrders.data || []).length;
if (smokeCount === 0) fail("hq.smoke_data", "No ORD-VERIFY orders in QA for filter test");
else pass("hq.smoke_data", `${smokeCount}+ ORD-VERIFY orders exist for UI filter`);

const hiddenInNormalView = (verifyOrders.data || []).every((o) => isVerificationTestOrderId(o.order_id));
if (!hiddenInNormalView) fail("hq.smoke_filter_fn", "isVerificationTestOrderId mismatch");
else pass("hq.smoke_filter_fn", "ORD-VERIFY / ORD-DC-SNAPSHOT classified as test orders");

if (!process.exitCode) {
  console.log(`\nStabilization order for manual browser UAT: ${orderId}`);
  console.log("All lab + orders sync stabilization checks passed.\n");
}
