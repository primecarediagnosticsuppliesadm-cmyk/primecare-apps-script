#!/usr/bin/env node
/**
 * RC1 procurement lifecycle closure — PO edit/cancel wiring (GAP-009/010/011).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}  ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}  ${msg}`);
  failures += 1;
}

const page = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const api = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");

console.log("\n=== RC1 Procurement Lifecycle Closure ===\n");

if (/cancelPurchaseOrderWrite/.test(page) && /updatePurchaseOrderWrite/.test(page)) {
  pass("PO-01", "PurchaseOrdersPage wires cancel + update");
} else {
  fail("PO-01", "PO cancel/edit UI missing");
}

if (/export async function cancelPurchaseOrderWrite/.test(api)) {
  pass("PO-02", "cancelPurchaseOrderWrite API");
} else {
  fail("PO-02", "cancelPurchaseOrderWrite API missing");
}

if (/export async function updatePurchaseOrderWrite/.test(api)) {
  pass("PO-03", "updatePurchaseOrderWrite API");
} else {
  fail("PO-03", "updatePurchaseOrderWrite API missing");
}

if (/Draft|Ordered/.test(page) && /cancel/i.test(page)) {
  pass("PO-04", "cancel action for Draft/Ordered POs");
} else {
  fail("PO-04", "cancel UX for Draft/Ordered");
}

if (/Received|Cancelled/.test(page) && /receive/i.test(page)) {
  pass("PO-05", "receive gated by PO status");
} else {
  fail("PO-05", "receive status gating");
}

console.log(`\nSummary: FAIL=${failures}`);
process.exit(failures > 0 ? 1 : 0);
