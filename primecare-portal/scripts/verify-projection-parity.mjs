#!/usr/bin/env node
/**
 * Projection parity — transactional reads vs domain projection adapters.
 * Usage: node scripts/verify-projection-parity.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

function orderKey(o) {
  return String(o?.orderId ?? o?.order_id ?? "").trim();
}

function labKey(c) {
  return String(c?.labId ?? c?.lab_id ?? "").trim().toUpperCase();
}

function recentDateYmd(daysBack = 90) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(1, Number(daysBack) || 90));
  return d.toISOString().slice(0, 10);
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function fetchTransactionalOrderUnitCounts(client, orderIds) {
  const ids = [...new Set(orderIds.map(String).map((v) => v.trim()).filter(Boolean))];
  const lineQty = new Map();
  const itemQty = new Map();

  for (const batch of chunk(ids, 20)) {
    const lines = await client
      .from("order_lines")
      .select("order_id,quantity")
      .in("order_id", batch);
    if (lines.error) {
      warn("txn.order_lines", lines.error.message || String(lines.error));
    } else {
      for (const row of lines.data || []) {
        const oid = String(row.order_id || "").trim();
        if (!oid) continue;
        lineQty.set(oid, (lineQty.get(oid) || 0) + num(row.quantity));
      }
    }

    const items = await client
      .from("order_items")
      .select("order_id,quantity")
      .in("order_id", batch);
    if (items.error) {
      warn("txn.order_items", items.error.message || String(items.error));
    } else {
      for (const row of items.data || []) {
        const oid = String(row.order_id || "").trim();
        if (!oid) continue;
        itemQty.set(oid, (itemQty.get(oid) || 0) + num(row.quantity));
      }
    }
  }

  const counts = new Map();
  for (const id of ids) {
    const lines = lineQty.get(id) || 0;
    const items = itemQty.get(id) || 0;
    counts.set(id, lines > 0 ? lines : items);
  }
  return counts;
}

async function readTransactionalOrdersForParity(client) {
  const recentFrom = recentDateYmd(90);
  const { data, error } = await client
    .from("orders")
    .select("id,order_id,tenant_id,lab_id,status,order_date,created_at,total_amount")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .or(`order_date.is.null,order_date.gte.${recentFrom},created_at.gte.${recentFrom}T00:00:00`)
    .order("order_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    return { success: false, error: error.message || String(error), data: { orders: [] } };
  }

  const rows = Array.isArray(data) ? data : [];
  const counts = await fetchTransactionalOrderUnitCounts(
    client,
    rows.map((row) => row.order_id)
  );
  const orders = rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    tenantId: row.tenant_id,
    labId: row.lab_id,
    orderStatus: row.status,
    orderDate: row.order_date || row.created_at,
    orderTotal: num(row.total_amount),
    itemCount: counts.get(String(row.order_id || "").trim()) || 0,
  }));

  return { success: true, data: { orders } };
}

loadEnv();

console.log("\n=== Projection parity (transactional vs adapter) ===\n");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
const adapters = await server.ssrLoadModule("/src/api/projectionReadAdapters.js");
const refresh = await server.ssrLoadModule("/src/api/projectionRefreshApi.js");
// NOTE: keep the Vite SSR runner alive until all API calls finish. Under Sprint 6A
// `getOrdersRead` may dynamic-import `projectionReadAdapters.js` when
// VITE_READ_ADAPTER_ORDERS_V1 is ON; closing the runner too early breaks the import.

const auth = await supabase.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});
if (auth.error) fail("auth.admin", auth.error.message);
else pass("auth.admin", QA_ADMIN.email);

const deployProbe = await supabase.rpc("read_orders_list_v1", {
  p_limit: 1,
  p_offset: 0,
  p_days_back: 90,
});
if (deployProbe.error?.message?.includes("Could not find the function")) {
  fail("deploy.rpcs", "Apply sprint2 projection migration first");
  process.exit(1);
}

const rebuildOrders = await refresh.rebuildProjectionV1(
  QA_HQ_TENANT_ID,
  "PRJ-ORD-ORDER-v1",
  90
);
if (!rebuildOrders.success) {
  fail("rebuild.orders", rebuildOrders.error || "rebuild_projection_v1 failed");
} else {
  pass("rebuild.orders", `${rebuildOrders.data?.row_count ?? "?"} rows`);
}

const rebuildRecv = await refresh.rebuildProjectionV1(
  QA_HQ_TENANT_ID,
  "PRJ-COL-LAB-v1",
  90
);
if (!rebuildRecv.success) {
  fail("rebuild.receivables", rebuildRecv.error || "rebuild failed");
} else {
  pass("rebuild.receivables", `${rebuildRecv.data?.row_count ?? "?"} rows`);
}

const [txnOrders, projOrders] = await Promise.all([
  readTransactionalOrdersForParity(supabase),
  adapters.readOrdersListV1({ force: true }),
]);

if (!txnOrders?.success) fail("txn.orders", txnOrders?.error || "getOrdersRead failed");
if (!projOrders?.success) fail("proj.orders", projOrders?.error || "readOrdersListV1 failed");

const txnOrderList = txnOrders.data?.orders || [];
const projOrderList = projOrders.data?.orders || [];
pass("orders.count", `txn=${txnOrderList.length} proj=${projOrderList.length}`);

const txnById = new Map(txnOrderList.map((o) => [orderKey(o), o]));
const projById = new Map(projOrderList.map((o) => [orderKey(o), o]));

let orderMismatches = 0;
const sampleIds = txnOrderList.slice(0, 15).map(orderKey).filter(Boolean);
for (const id of sampleIds) {
  const t = txnById.get(id);
  const p = projById.get(id);
  if (!p) {
    orderMismatches += 1;
    fail("parity.orders.missing", `${id} missing in projection`);
    continue;
  }
  const tItems = num(t.itemCount);
  const pItems = num(p.itemCount);
  const tTotal = num(t.orderTotal);
  const pTotal = num(p.orderTotal);
  if (tItems !== pItems || Math.abs(tTotal - pTotal) > 0.02) {
    orderMismatches += 1;
    fail(
      "parity.orders.field",
      `${id} items txn=${tItems} proj=${pItems} total txn=${tTotal} proj=${pTotal}`
    );
  } else {
    pass("parity.orders.field", `${id} items=${tItems} total=${tTotal}`);
  }
}

if (!orderMismatches) {
  pass("parity.orders", `${sampleIds.length} sampled orders match`);
}

const [txnColl, projColl] = await Promise.all([
  api.getCollectionsRead({ force: true }),
  adapters.readLabReceivablesListV1({ force: true }),
]);

if (!txnColl?.success) fail("txn.collections", txnColl?.error || "getCollectionsRead failed");
if (!projColl?.success) fail("proj.collections", projColl?.error || "readLabReceivablesListV1 failed");

const txnRows = txnColl.data?.collections || [];
const projRows = projColl.data?.collections || [];
pass("collections.count", `txn=${txnRows.length} proj=${projRows.length}`);

const txnCollByLab = new Map(txnRows.map((c) => [labKey(c), c]));
const projCollByLab = new Map(projRows.map((c) => [labKey(c), c]));

let collMismatches = 0;
const collSample = txnRows.slice(0, 12).map(labKey).filter(Boolean);
for (const lab of collSample) {
  const t = txnCollByLab.get(lab);
  const p = projCollByLab.get(lab);
  if (!p) {
    collMismatches += 1;
    fail("parity.collections.missing", `${lab} missing in projection`);
    continue;
  }
  const tOut = num(t.outstandingAmount);
  const pOut = num(p.outstandingAmount);
  const tPaid = num(t.totalPaid);
  const pPaid = num(p.totalPaid);
  if (Math.abs(tOut - pOut) > 0.02 || Math.abs(tPaid - pPaid) > 0.02) {
    collMismatches += 1;
    fail(
      "parity.collections.field",
      `${lab} out txn=${tOut} proj=${pOut} paid txn=${tPaid} proj=${pPaid}`
    );
  } else {
    pass("parity.collections.field", `${lab} out=${tOut} paid=${tPaid}`);
  }
}

const txnSummary = txnColl.data?.summary || {};
const projSummary = projColl.data?.summary || {};
if (
  Math.abs(num(txnSummary.totalOutstanding) - num(projSummary.totalOutstanding)) > 1
) {
  fail(
    "parity.collections.summary",
    `totalOutstanding txn=${txnSummary.totalOutstanding} proj=${projSummary.totalOutstanding}`
  );
} else {
  pass(
    "parity.collections.summary",
    `totalOutstanding=${num(txnSummary.totalOutstanding)}`
  );
}

if (!collMismatches) {
  pass("parity.collections", `${collSample.length} sampled labs match`);
}

await server.close();

console.log("\n=== Projection parity complete ===\n");
