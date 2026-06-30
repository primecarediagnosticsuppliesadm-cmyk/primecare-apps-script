#!/usr/bin/env node
/**
 * HQ freeze policy — structural vs daily ops regression checks (static wiring).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const policy = readFileSync(resolve(root, "src/config/hqReleasePolicy.js"), "utf8");
const orders = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const ops = readFileSync(resolve(root, "src/components/operations/UserProvisioningPanel.jsx"), "utf8");
const catalog = readFileSync(resolve(root, "src/pages/MasterCatalogPage.jsx"), "utf8");
const creditRisk = readFileSync(
  resolve(root, "src/components/hq/HqCreditRiskCommandCenter.jsx"),
  "utf8"
);

assert(/isHqOrderStatusWriteBlocked/.test(policy), "order status write policy");
assert(/isHqStructuralWriteBlocked/.test(policy), "structural write policy");
assert(/isHqCatalogWriteBlocked/.test(policy), "catalog write policy");
assert(/isHqProcurementWriteBlocked/.test(policy), "procurement write policy");
assert(/HQ configuration is frozen/.test(policy), "default freeze banner copy");

assert(/isHqOrderStatusWriteBlocked/.test(orders), "Orders uses status write policy");
assert(!/disabled=\{updatingStatus \|\| hqFrozen\}/.test(orders), "Review not disabled by freeze");
assert(!/disabled=\{hqFrozen\}[\s\S]{0,240}handleRecordOrderPayment/.test(orders), "Record Payment not disabled by freeze");
assert(!/function handleRecordOrderPayment\(\) \{[\s\S]{0,80}if \(hqFrozen\) return;/.test(orders), "Record Payment handler not blocked by freeze");
assert(/Fully Paid/.test(orders), "Fully Paid state preserved");
const ordersStatusActions = orders.slice(orders.indexOf("Status Actions"));
assert(/Mark Processing/.test(ordersStatusActions) && /hqStatusWriteBlocked/.test(ordersStatusActions), "Status writes blocked when frozen");

assert(/isHqStructuralWriteBlocked/.test(ops), "Operations uses structural write policy");
assert(/disabled=\{hqFrozen\}/.test(ops) && /Create User/.test(ops), "Create User blocked when frozen");
assert(/resolveDirectoryRowActions/.test(ops), "directory row actions wired");

assert(/isHqCatalogWriteBlocked/.test(catalog), "Master catalog uses catalog write policy");
assert(/disabled=\{catalogWriteBlocked\}/.test(catalog), "Catalog writes disabled when frozen");

assert(/Record Payment/.test(creditRisk), "Credit & Risk Record Payment available");
assert(!/hqFrozen/.test(creditRisk), "Credit & Risk not tied to HQ freeze");

console.log("PASS — HQ freeze policy wiring");
