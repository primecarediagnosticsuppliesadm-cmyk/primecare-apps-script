#!/usr/bin/env node
/**
 * Sprint 1B — Inventory navigation context & continuity verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/StockPage.jsx"), "utf8");
const startSrc = readFileSync(resolve(root, "src/components/inventory/InventoryStartHere.jsx"), "utf8");
const stripSrc = readFileSync(resolve(root, "src/components/inventory/InventoryContextStrip.jsx"), "utf8");
const ctxUiSrc = readFileSync(resolve(root, "src/inventory/inventoryContextUi.js"), "utf8");
const returnSrc = readFileSync(resolve(root, "src/inventory/inventoryWorkflowReturn.js"), "utf8");
const purchaseSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const catalogSrc = readFileSync(resolve(root, "src/pages/MasterCatalogPage.jsx"), "utf8");
const ordersSrc = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const portalSrc = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const actionMapperSrc = readFileSync(resolve(root, "src/inventory/mapInventoryMutationError.js"), "utf8");

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

assert(/Start here/i.test(startSrc), "start_here.label", "Start Here label present");
assert(/Receive Purchase Order/.test(ctxUiSrc), "start_here.receive", "Receive Purchase Order action");
assert(/Review Critical Stock/.test(ctxUiSrc), "start_here.critical", "Review Critical Stock action");
assert(/Create Purchase Order/.test(ctxUiSrc), "start_here.create_po", "Create Purchase Order action");
assert(/Review Reorder Candidates/.test(ctxUiSrc), "start_here.reorder", "Review Reorder Candidates action");
assert(/Investigate Stock Risk/.test(ctxUiSrc), "start_here.risk", "Investigate Stock Risk action");
assert(/buildInventoryStartHereActions/.test(startSrc), "start_here.builder", "Start Here uses shared builder");
assert(/criticalCount/.test(startSrc) && /reorderCount/.test(startSrc), "start_here.existing_counts", "Start Here uses existing health counts");
assert(!/Math\.random|priorityScore|fakePercent/.test(ctxUiSrc + startSrc), "start_here.no_invented_math", "no invented prioritization");

assert(/InventoryContextStrip/.test(pageSrc), "context.strip_wired", "StockPage wires context strip");
assert(/Viewing:/.test(stripSrc), "context.strip_viewing", "strip uses Viewing label");
assert(/buildInventoryContextParts/.test(ctxUiSrc), "context.parts_builder", "context parts builder exists");
assert(/Writes frozen/.test(ctxUiSrc), "context.freeze_part", "freeze state included in strip parts");

assert(/aria-selected=\{isSelected\}/.test(pageSrc), "selection.aria", "selected row exposes aria-selected");
assert(/ring-indigo-400/.test(pageSrc), "selection.visual", "selected row has explicit visual state");
assert(/Selected SKU/.test(pageSrc), "selection.detail", "selected SKU panel present");
assert(/FOCUS_OUTSIDE_FILTERS/.test(ctxUiSrc) || /Focused SKU is outside/.test(ctxUiSrc), "focus.outside_copy", "outside-filter recovery copy");
assert(/Clear Filters/.test(pageSrc) || /clearLabel/.test(pageSrc), "focus.clear_filters", "Clear Filters recovery wired");
assert(/Return to Inventory/.test(pageSrc) || /returnLabel/.test(pageSrc), "focus.return_inventory", "Return to Inventory recovery wired");
assert(/Clear Filters/.test(ctxUiSrc) && /Return to Inventory/.test(ctxUiSrc), "focus.recovery_copy", "Clear Filters / Return to Inventory copy defined");

assert(/writeInventoryReturnContext/.test(pageSrc), "return.write", "Inventory stores return context before leave");
assert(/primecare_inventory_return_context/.test(returnSrc), "return.key", "session key defined");
assert(/armInventoryReturnRestore/.test(returnSrc), "return.arm", "Back to Inventory arms restore");
assert(/consumeInventoryReturnContextIfArmed/.test(pageSrc), "return.restore", "Inventory restores armed context");
assert(/Back to Inventory/.test(purchaseSrc), "return.purchase_cta", "Purchase shows Back to Inventory");
assert(/Back to Inventory/.test(catalogSrc), "return.catalog_cta", "Master Catalog shows Back to Inventory");
assert(/Back to Inventory/.test(ordersSrc), "return.orders_cta", "Orders shows Back to Inventory");
assert(/setActivePage=\{setActivePage\}/.test(portalSrc) && /StockPage/.test(portalSrc), "return.portal_stock", "portal passes setActivePage to StockPage");

assert(/buildInventoryListEmptyCopy/.test(pageSrc), "empty.differentiated", "differentiated empty states wired");
assert(/No inventory matches search/.test(ctxUiSrc), "empty.search", "search empty copy");
assert(/No critical stock/.test(ctxUiSrc), "empty.critical", "critical empty copy");
assert(/No reorder candidates/.test(ctxUiSrc), "empty.reorder", "reorder empty copy");
assert(/No inventory yet/.test(ctxUiSrc), "empty.none", "no inventory copy");

assert(/Stock summary & valuation \(secondary\)/.test(pageSrc), "budget.summary_collapsed", "analytics/KPIs collapsed secondary");
assert(/What inventory work needs my attention/.test(pageSrc), "budget.primary_question", "primary question in header");
assert(!/data-inventory-start-here/.test(pageSrc) || /InventoryStartHere/.test(pageSrc), "budget.start_here_first", "Start Here component wired");

assert(/ActionErrorSummary/.test(catalogSrc), "sprint1a.catalog_error", "Sprint 1A ActionErrorSummary still on catalog");
assert(/receiveMutationError/.test(purchaseSrc), "sprint1a.receive_error", "Sprint 1A receive mutation error intact");
assert(/mapInventoryMutationError/.test(actionMapperSrc), "sprint1a.mapper", "Sprint 1A error mapper intact");

assert(!/adjustInventoryWrite|transferInventoryWrite|cycleCountWrite/.test(pageSrc), "scope.no_new_writes", "no Adjust/Transfer/Cycle Count writes");
assert(!/ORDER_OUT/.test(pageSrc), "scope.no_order_out", "StockPage does not invent ORDER_OUT");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — inventory navigation context verified\n");
