#!/usr/bin/env node
/**
 * Inventory Certification Closure — INV-CERT-005 / 007 / 001 static gate.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = resolve(root, "docs/QA/modules/inventory");

const ledgerSrc = readFileSync(resolve(root, "src/pages/InventoryLedgerPage.jsx"), "utf8");
const purchaseSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const stockSrc = readFileSync(resolve(root, "src/pages/StockPage.jsx"), "utf8");
const catalogSrc = readFileSync(resolve(root, "src/pages/MasterCatalogPage.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/inventory/mapInventoryMutationError.js"), "utf8");

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

const requiredDocs = [
  "Certification_Evidence_Index.md",
  "Certification_Evidence_Checklist.md",
  "Certification_Signoff_Template.md",
  "Certification_Closure_UAT_Checklist.md",
  "Certification_Closure_Functional_Parity_Report.md",
  "Certification_Closure_PreImplementation.md",
  "Sprint1A_UAT_Checklist.md",
  "Sprint1B_UAT_Checklist.md",
  "Sprint1C_UAT_Checklist.md",
];

for (const name of requiredDocs) {
  assert(existsSync(resolve(docs, name)), `evidence.${name}`, `${name} present`);
}

assert(/Historical Inventory Movement/.test(ledgerSrc), "cert007.historical_label", "Historical Inventory Movement label present");
assert(!/return \"Inventory Adjustment\"/.test(ledgerSrc), "cert007.no_adjustment_action_label", "Inventory Adjustment action label removed");
assert(/OPENING-/.test(ledgerSrc) && /Opening Stock/.test(ledgerSrc), "cert007.opening_preserved", "Opening Stock label preserved");
assert(
  !/\bAdjust Stock\b/.test(ledgerSrc) && !/createAdjustmentWrite|adjustInventoryWrite/.test(ledgerSrc),
  "cert007.no_adjust_workflow",
  "no Adjust Stock workflow added"
);

assert(/PURCHASE_WORKSPACE_GROUPS/.test(purchaseSrc), "cert001.groups_defined", "Purchase workspace groups defined");
assert(/data-purchase-workspace-groups/.test(purchaseSrc), "cert001.groups_wired", "Purchase groups rendered");
assert(/Replenishment/.test(purchaseSrc) && /Receiving/.test(purchaseSrc) && /Purchase administration/.test(purchaseSrc), "cert001.group_titles", "group titles present");
assert(/receivePurchaseOrderWrite/.test(purchaseSrc), "cert001.receive_api", "receive write path unchanged");
assert(/Back to Inventory/.test(purchaseSrc), "cert001.return_intact", "Sprint 1B Back to Inventory intact");

assert(/InventoryStartHere/.test(stockSrc), "regression.1b_start", "Sprint 1B Start Here retained");
assert(/data-inventory-workspace="hq"/.test(stockSrc), "regression.1c_workspace", "Sprint 1C workspace marker retained");
assert(/ActionErrorSummary/.test(catalogSrc), "regression.1a_catalog", "Sprint 1A catalog errors retained");
assert(/mapInventoryMutationError/.test(mapperSrc), "regression.1a_mapper", "Sprint 1A mapper retained");

assert(!/adjustInventoryWrite|transferInventoryWrite/.test(stockSrc + purchaseSrc + ledgerSrc), "scope.no_new_writes", "no new adjust/transfer writes");
assert(!/ORDER_OUT/.test(stockSrc), "scope.no_order_out_ui", "StockPage does not invent ORDER_OUT");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — inventory certification closure verified\n");
