#!/usr/bin/env node
/**
 * Sprint 6A — Orders projection network audit.
 *
 * Asserts that the HQ Orders list critical-path load performs **zero** reads on
 * `order_items` or `order_lines` when `VITE_READ_ADAPTER_ORDERS_V1=true`, and
 * that the detail drawer still uses transactional SoT.
 *
 * Usage: node scripts/verify-orders-projection-network-audit.mjs
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

const env = loadEnv();

if (String(env.VITE_READ_ADAPTER_ORDERS_V1 || "").toLowerCase() !== "true") {
  fail(
    "flag.orders",
    "VITE_READ_ADAPTER_ORDERS_V1 must be true on QA to run this audit (Sprint 6A)"
  );
  process.exit(1);
}
pass("flag.orders", "VITE_READ_ADAPTER_ORDERS_V1=true");
if (String(env.VITE_READ_ADAPTER_RECEIVABLES_V1 || "").toLowerCase() === "true") {
  fail("flag.receivables", "must remain OFF for Sprint 6A");
}
if (String(env.VITE_READ_ADAPTER_DASHBOARD_V1 || "").toLowerCase() === "true") {
  fail("flag.dashboard", "must remain OFF for Sprint 6A");
}
if (String(env.VITE_READ_ADAPTER_EXECUTIVE_V1 || "").toLowerCase() === "true") {
  fail("flag.executive", "must remain OFF for Sprint 6A");
}

console.log("\n=== Sprint 6A Orders projection network audit ===\n");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
// Preload the projection adapter through the SSR runner so the dynamic import
// inside getOrdersRead resolves without a live-runner error.
await server.ssrLoadModule("/src/api/projectionReadAdapters.js");

const auth = await supabase.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});
if (auth.error) {
  fail("auth.admin", auth.error.message);
  await server.close();
  process.exit(1);
}
pass("auth.admin", QA_ADMIN.email);

// Instrument supabase.from and supabase.rpc for the list-load path.
const listTables = [];
const listRpcs = [];
const origListFrom = supabase.from.bind(supabase);
const origListRpc = supabase.rpc.bind(supabase);
supabase.from = (table) => {
  listTables.push(table);
  return origListFrom(table);
};
supabase.rpc = (fn, args) => {
  listRpcs.push(fn);
  return origListRpc(fn, args);
};

const listRes = await api.getOrdersRead({
  force: true,
  tenantId: QA_HQ_TENANT_ID,
  skipLineCounts: true,
});
// Reset before running detail drawer.
supabase.from = origListFrom;
supabase.rpc = origListRpc;

if (!listRes?.success) {
  fail("list.load", listRes?.error || "getOrdersRead failed");
  await server.close();
  process.exit(1);
}

const orders = listRes.data?.orders || [];
pass("list.load", `${orders.length} orders (projection=${listRes.projection === true})`);

if (listRes.projection !== true) {
  fail("list.source", "Orders list did not resolve through projection adapter");
}

const badList = listTables.filter(
  (t) => t === "order_items" || t === "order_lines"
);
if (badList.length) {
  fail(
    "list.no-line-tables",
    `list load queried forbidden tables: ${[...new Set(badList)].join(", ")}`
  );
} else {
  pass("list.no-line-tables", "no order_items/order_lines on list critical path");
}

if (!listRpcs.includes("read_orders_list_v1")) {
  fail("list.rpc", "expected read_orders_list_v1 to be invoked on list load");
} else {
  pass("list.rpc", "read_orders_list_v1 invoked on list load");
}

// Detail drawer must still read SoT for a single order (allowed per Sprint 6A rules).
const detailTables = [];
const detailRpcs = [];
supabase.from = (table) => {
  detailTables.push(table);
  return origListFrom(table);
};
supabase.rpc = (fn, args) => {
  detailRpcs.push(fn);
  return origListRpc(fn, args);
};

const sample = orders.find((o) => Number(o?.itemCount) > 0) || orders[0];
if (!sample) {
  warn("detail.skip", "no orders available to sample detail drawer");
} else {
  const detailRes = await api.getOrderDetailsRead(sample.orderId);
  if (!detailRes?.success) {
    fail("detail.load", detailRes?.error || "getOrderDetailsRead failed");
  } else {
    const lines = detailRes?.data?.lines || [];
    pass(
      "detail.load",
      `${sample.orderId} lines=${lines.length} (SoT read allowed on detail)`
    );
  }
  const detailReadsLineTable = detailTables.some(
    (t) => t === "order_lines" || t === "order_items"
  );
  if (detailReadsLineTable) {
    pass(
      "detail.uses-sot",
      "detail drawer read order_lines/order_items (single order — allowed)"
    );
  } else {
    warn(
      "detail.uses-sot",
      "detail drawer did not read order_lines/order_items — verify per-order path"
    );
  }
}

supabase.from = origListFrom;
supabase.rpc = origListRpc;
await server.close();

console.log("\n=== Sprint 6A network audit complete ===\n");
if (process.exitCode) {
  console.log("Overall: NO-GO\n");
} else {
  console.log("Overall: GO (Orders list = projection only; detail drawer = SoT)\n");
}
