#!/usr/bin/env node
/**
 * Static + smoke checks for demonstrated unbounded reads (Sprint 1).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const paymentHistory = read("src/collections/collectionsPaymentHistory.js");
assert(
  !paymentHistory.includes('.from("payments").select("*")'),
  "collectionsPaymentHistory must not select all payments"
);
assert(
  paymentHistory.includes("fetchPaymentsForLabBoundedRows"),
  "collectionsPaymentHistory must use fetchPaymentsForLabBoundedRows"
);

const api = read("src/api/primecareSupabaseApi.js");
const poFn = api.slice(api.indexOf("export async function getPurchaseOrdersRead"), api.indexOf("export async function createPurchaseOrderWrite"));
assert(
  poFn.includes("fetchPurchaseOrdersBoundedBundle"),
  "getPurchaseOrdersRead must use fetchPurchaseOrdersBoundedBundle"
);
assert(
  !poFn.includes('.from("purchase_orders").select("*")'),
  "getPurchaseOrdersRead must not unbounded select purchase_orders"
);
assert(
  !poFn.includes('.from("purchase_order_items").select("*")'),
  "getPurchaseOrdersRead must not unbounded select purchase_order_items"
);

const bounded = read("src/api/hqBoundedReads.js");
assert(
  bounded.includes("fetchPurchaseOrdersBoundedBundle"),
  "hqBoundedReads must export fetchPurchaseOrdersBoundedBundle"
);
assert(bounded.includes("HQ_PURCHASE_ORDER_LIST_COLUMNS"), "PO list columns defined");

console.log("PASS — bounded read guards (payments + purchase orders)");
