#!/usr/bin/env node
/**
 * Sprint 1A — Inventory action feedback verification (static source gate).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogSrc = readFileSync(resolve(root, "src/pages/MasterCatalogPage.jsx"), "utf8");
const purchaseSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/inventory/mapInventoryMutationError.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/inventory/inventoryActionUi.js"), "utf8");

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

assert(/mapInventoryMutationError/.test(catalogSrc), "catalog.mutation_mapper", "catalog uses inventory mutation mapper");
assert(/ActionErrorSummary/.test(catalogSrc), "catalog.error_summary", "catalog shows ActionErrorSummary");
assert(/submitInflightRef/.test(catalogSrc), "catalog.form_inflight", "catalog form duplicate submission guard");
assert(/toggleInflightRef/.test(catalogSrc), "catalog.toggle_inflight", "catalog toggle duplicate submission guard");
assert(/showToast\(\"success\"/.test(catalogSrc), "catalog.success_toast", "catalog success uses toast");
assert(/load\(\{ silent: true \}\)/.test(catalogSrc), "catalog.silent_refresh", "catalog silent refresh preserves scroll");
assert(/aria-busy=\{saving\}/.test(catalogSrc), "catalog.form_aria_busy", "catalog form submit exposes aria-busy");
assert(/aria-busy=\{rowBusy\}/.test(catalogSrc), "catalog.toggle_aria_busy", "catalog toggle exposes aria-busy");
assert(/getCatalogCreateLoadingLabel/.test(catalogSrc), "catalog.create_loading", "catalog create loading helper");
assert(/getSkuToggleLoadingLabel/.test(catalogSrc), "catalog.toggle_loading", "catalog toggle loading helper");
assert(!/setError\(err\?\.message \|\| \"Failed to save product\"\)/.test(catalogSrc), "catalog.no_raw_form_setError", "form failures use ActionErrorSummary");
assert(!/setStatusMessage\(\s*\n?\s*nextActive/.test(catalogSrc), "catalog.no_status_banner_toggle", "toggle success uses toast not status banner");

assert(/mapInventoryMutationError/.test(purchaseSrc), "receive.mutation_mapper", "receive uses inventory mutation mapper");
assert(/receiveMutationError/.test(purchaseSrc), "receive.mutation_error_state", "receive mutation error state present");
assert(/receiveInflightRef/.test(purchaseSrc), "receive.inflight_guard", "receive duplicate submission guard");
assert(/ActionErrorSummary/.test(purchaseSrc), "receive.error_summary", "receive shows ActionErrorSummary");
assert(/getReceiveStockLoadingLabel/.test(purchaseSrc), "receive.loading_helper", "receive loading label helper");
assert(/aria-busy=\{receivingPo\}/.test(purchaseSrc), "receive.aria_busy", "receive button exposes aria-busy");
assert(/showToast\(\s*\"success\"/.test(purchaseSrc), "receive.success_toast", "receive success uses toast");
assert(!/setErrorMessage\(err\?\.message \|\| \"Failed to receive purchase order\"\)/.test(purchaseSrc), "receive.no_page_top_error", "receive failures no longer use page-top errorMessage");

assert(/SKU already exists/.test(mapperSrc), "map.sku_exists", "SKU already exists mapped");
assert(/SKU disabled/.test(mapperSrc), "map.sku_disabled", "SKU disabled mapped");
assert(/Stock cannot be negative/.test(mapperSrc), "map.negative_stock", "negative stock mapped");
assert(/Opening stock already initialized/.test(mapperSrc), "map.opening_stock", "opening stock mapped");
assert(/Purchase receipt already processed/.test(mapperSrc), "map.receipt_processed", "purchase receipt mapped");
assert(/Permission denied/.test(mapperSrc), "map.permission", "permission denied mapped");
assert(/Unexpected inventory write failure/.test(mapperSrc), "map.unexpected", "unexpected write failure mapped");
assert(/Never surface raw Postgres/.test(mapperSrc) || /raw Postgres/.test(mapperSrc), "map.no_raw_pg", "mapper documents Postgres suppression");
assert(/UNEXPECTED_INVENTORY_WRITE_FAILURE/.test(mapperSrc), "map.unexpected_code", "unexpected inventory write failure code");
assert(/postgres/i.test(mapperSrc), "map.pg_pattern", "mapper matches postgres noise patterns");

assert(/Creating SKU…/.test(uiSrc), "ui.creating_sku", "Creating SKU label");
assert(/Saving Opening Stock…/.test(uiSrc), "ui.opening_stock", "Saving Opening Stock label");
assert(/Receiving Stock…/.test(uiSrc), "ui.receiving", "Receiving Stock label");
assert(/Enabling SKU…/.test(uiSrc), "ui.enabling", "Enabling SKU label");
assert(/Disabling SKU…/.test(uiSrc), "ui.disabling", "Disabling SKU label");

assert(!/Start Here/.test(catalogSrc), "scope.no_start_here_catalog", "Sprint 1B Start Here not in catalog");
assert(!/Start Here/.test(purchaseSrc), "scope.no_start_here_purchase", "Sprint 1B Start Here not in purchase");
assert(!/adjustStock|transferStock|cycleCount/i.test(catalogSrc + purchaseSrc), "scope.no_new_workflows", "no Adjust/Transfer/Cycle Count workflows added");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — inventory action feedback verified\n");
