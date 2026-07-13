#!/usr/bin/env node
/**
 * Sprint 1C — Inventory workspace simplification verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/StockPage.jsx"), "utf8");
const workspaceUiSrc = readFileSync(resolve(root, "src/inventory/inventoryWorkspaceUi.js"), "utf8");
const collapsibleSrc = readFileSync(
  resolve(root, "src/components/inventory/InventoryCollapsibleSection.jsx"),
  "utf8"
);
const startSrc = readFileSync(resolve(root, "src/components/inventory/InventoryStartHere.jsx"), "utf8");
const returnSrc = readFileSync(resolve(root, "src/inventory/inventoryWorkflowReturn.js"), "utf8");
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

assert(/INVENTORY_WORKSPACE_PRIMARY_QUESTION/.test(workspaceUiSrc), "ia.primary_question", "primary question constant defined");
assert(/What inventory work should I do now\?/.test(workspaceUiSrc), "ia.question_copy", "operational primary question copy");
assert(/INVENTORY_WORKSPACE_PRIMARY_QUESTION/.test(pageSrc), "ia.header_wired", "page header uses primary question");
assert(/data-inventory-workspace="hq"/.test(pageSrc), "ia.workspace_marker", "single HQ workspace marker (no split)");
assert(!/resolveInventoryWorkspace/.test(pageSrc), "ia.no_persona_split", "no persona workspace resolver");

assert(/InventoryCollapsibleSection/.test(collapsibleSrc), "collapse.component", "collapsible section component exists");
assert(/Stock summary & valuation/.test(pageSrc), "collapse.summary", "KPI/valuation collapsed under summary");
assert(/SKU details/.test(pageSrc), "collapse.sku_details", "SKU details collapsed");
assert(/Audit identifiers/.test(pageSrc), "collapse.audit", "audit identifiers collapsed");
assert(/InventoryCollapsibleSection title="Stock summary & valuation"[\s\S]*HqInventoryValueAnalytics/.test(pageSrc), "budget.analytics_inside_collapse", "valuation nested in collapsible summary");

const startIdx = pageSrc.indexOf('data-inventory-start-here-region');
const filtersIdx = pageSrc.indexOf('data-inventory-filters');
const listIdx = pageSrc.indexOf('data-inventory-list=');
const selectedIdx = pageSrc.indexOf("data-inventory-selected-sku=");
const summaryIdx = pageSrc.indexOf('title="Stock summary & valuation"');
assert(startIdx > 0 && filtersIdx > startIdx, "budget.start_before_filters", "Start Here before filters");
assert(filtersIdx > 0 && listIdx > filtersIdx, "budget.filters_before_list", "Filters before list");
assert(listIdx > 0 && selectedIdx > listIdx, "budget.list_before_selected", "List before selected SKU panel");
assert(selectedIdx > 0 && summaryIdx > selectedIdx, "budget.selected_before_summary", "Selected SKU before valuation summary");

assert(/getInventoryExpectedActionCopy/.test(pageSrc), "discover.expected_action", "expected action copy wired");
assert(/data-inventory-expected-action/.test(pageSrc), "discover.expected_marker", "expected action visible in detail");
assert(/Receive Stock/.test(pageSrc), "discover.receive_cta", "Receive Stock CTA on selected SKU");
assert(/Open Ledger/.test(pageSrc), "discover.ledger_cta", "Ledger access retained");

assert(/InventoryContextStrip/.test(pageSrc), "sprint1b.strip", "Sprint 1B context strip retained");
assert(/InventoryStartHere/.test(pageSrc), "sprint1b.start_here", "Sprint 1B Start Here retained");
assert(/writeInventoryReturnContext/.test(pageSrc), "sprint1b.return", "Sprint 1B return context retained");
assert(/primecare_inventory_return_context/.test(returnSrc), "sprint1b.return_key", "return context key intact");
assert(/Start here/i.test(startSrc), "sprint1b.start_label", "Start Here label retained");

assert(/mapInventoryMutationError/.test(actionMapperSrc), "sprint1a.mapper", "Sprint 1A error mapper intact");
assert(!/setErrorMessage\(err\?\.message \|\| \"Failed to receive/.test(pageSrc), "sprint1a.no_page_receive_error", "StockPage does not own receive mutation errors");

assert(!/adjustInventoryWrite|transferInventoryWrite|cycleCountWrite/.test(pageSrc), "scope.no_new_writes", "no Adjust/Transfer/Cycle Count writes");
assert(!/ORDER_OUT/.test(pageSrc), "scope.no_order_out", "StockPage does not invent ORDER_OUT");
assert((pageSrc.match(/Stock summary & valuation/g) || []).length === 1, "budget.single_summary", "summary heading appears once");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — inventory workspace simplification verified\n");
