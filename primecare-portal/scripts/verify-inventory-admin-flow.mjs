#!/usr/bin/env node
/**
 * Inventory admin flow parity gate — Sprint 1A.
 * Confirms catalog/receive still call the same write APIs (no workflow redesign).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogSrc = readFileSync(resolve(root, "src/pages/MasterCatalogPage.jsx"), "utf8");
const purchaseSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

assert(/createHqProductWrite/.test(catalogSrc), "admin.create_sku", "Master Catalog still creates via createHqProductWrite");
assert(/updateHqProductWrite/.test(catalogSrc), "admin.update_sku", "Master Catalog still updates via updateHqProductWrite");
assert(/setHqProductActiveWrite/.test(catalogSrc), "admin.toggle_sku", "Master Catalog still toggles via setHqProductActiveWrite");
assert(/openingStock/.test(catalogSrc), "admin.opening_stock_field", "Opening stock remains on create form");
assert(/receivePurchaseOrderWrite/.test(purchaseSrc), "admin.receive_write", "Purchase Receive still uses receivePurchaseOrderWrite");
assert(/handleReceivePurchaseOrder/.test(purchaseSrc), "admin.receive_handler", "Receive handler present");

assert(/export async function createHqProductWrite/.test(apiSrc), "api.create_export", "createHqProductWrite export intact");
assert(/export async function receivePurchaseOrderWrite/.test(apiSrc), "api.receive_export", "receivePurchaseOrderWrite export intact");
assert(/movement_type: \"PURCHASE_IN\"/.test(apiSrc), "api.purchase_in", "PURCHASE_IN ledger path intact");
assert(/movement_type: \"IN\"/.test(apiSrc), "api.opening_in", "Opening stock IN ledger path intact");

assert(!/adjustInventoryWrite|transferInventoryWrite|cycleCountWrite/.test(catalogSrc + purchaseSrc), "admin.no_new_writes", "No new adjust/transfer/cycle-count UI writes");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — inventory admin flow parity verified\n");
