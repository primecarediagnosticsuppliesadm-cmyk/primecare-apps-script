#!/usr/bin/env node
/**
 * HQ list vs detail drawer item-count parity (live QA API).
 * Usage: node scripts/verify-hq-list-detail-parity.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { QA_ADMIN } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}

function resolveOrderLineUnitCount(lines = []) {
  return (lines || []).reduce((sum, line) => {
    const n = Number(line?.quantity);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
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

loadEnv();

console.log("\n=== HQ list / detail item-count parity ===\n");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
// Sprint 6A — preload projection adapters so dynamic import inside getOrdersRead
// resolves through the vite runner while it is still alive.
await server.ssrLoadModule("/src/api/projectionReadAdapters.js");

const auth = await supabase.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});
if (auth.error) fail("auth.admin", auth.error.message);
else pass("auth.admin", QA_ADMIN.email);

const listRes = await api.getOrdersRead({ force: true });
if (!listRes?.success) fail("orders.list", listRes?.error || "getOrdersRead failed");
const orders = listRes?.data?.orders || [];
pass("orders.list", `${orders.length} orders`);

const sample = orders.filter((o) => Number(o.itemCount) > 0).slice(0, 8);
const zeroSample = orders.filter((o) => !Number(o.itemCount)).slice(0, 5);
const toCheck = [...sample, ...zeroSample].slice(0, 12);

if (!toCheck.length) fail("orders.sample", "No orders returned for parity sampling");

let mismatches = 0;
for (const row of toCheck) {
  const orderId = row.orderId;
  const detailRes = await api.getOrderDetailsRead(orderId);
  const lines = detailRes?.data?.lines || [];
  const detailUnits = resolveOrderLineUnitCount(lines);
  const listUnits = Number(row.itemCount) || 0;
  if (detailUnits !== listUnits) {
    mismatches += 1;
    fail("parity", `${orderId} list=${listUnits} detail=${detailUnits}`);
  } else {
    pass("parity", `${orderId} ${listUnits} units`);
  }
}

if (!mismatches) {
  console.log(`\nAll ${toCheck.length} sampled orders match list vs detail unit counts.\n`);
} else {
  console.error(`\n${mismatches} mismatch(es) — check order_lines / order_items keys.\n`);
}

await server.close();
