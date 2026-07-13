#!/usr/bin/env node
/**
 * Order ↔ inventory sync gate — Sprint 1A.
 * Confirms ORDER_OUT fulfill path remains in Orders (not redesigned by Inventory UX).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiSrc = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
const ordersSrc = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const catalogSrc = readFileSync(resolve(root, "src/pages/MasterCatalogPage.jsx"), "utf8");
const purchaseSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");

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

assert(/applyLabOrderInventoryDeduction/.test(apiSrc), "sync.deduction_api", "applyLabOrderInventoryDeduction present");
assert(/ORDER_OUT/.test(apiSrc), "sync.order_out", "ORDER_OUT ledger movement present");
assert(/updateOrderStatusWrite/.test(ordersSrc), "sync.orders_status", "Orders status writes intact");
assert(!/applyLabOrderInventoryDeduction/.test(catalogSrc), "sync.catalog_no_order_out", "Catalog does not call order inventory deduction");
assert(!/applyLabOrderInventoryDeduction/.test(purchaseSrc), "sync.purchase_no_order_out", "Purchase page does not call order inventory deduction");
assert(!/ORDER_OUT/.test(catalogSrc), "sync.catalog_no_order_out_literal", "Catalog UI does not invent ORDER_OUT writes");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — order inventory sync boundary verified\n");
