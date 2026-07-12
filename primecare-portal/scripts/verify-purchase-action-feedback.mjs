#!/usr/bin/env node
/**
 * Sprint 1A — Purchase action feedback verification (static source gate).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const purchaseSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/purchase/mapPurchaseMutationError.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/purchase/purchaseActionUi.js"), "utf8");

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

assert(/mapPurchaseMutationError/.test(purchaseSrc), "purchase.mutation_mapper", "page uses purchase mutation mapper");
assert(/ActionErrorSummary/.test(purchaseSrc), "purchase.error_summary", "page shows ActionErrorSummary");
assert(/createMutationError/.test(purchaseSrc), "create.error_state", "create mutation error state");
assert(/receiveMutationError/.test(purchaseSrc), "receive.error_state", "receive mutation error state");
assert(/editMutationError/.test(purchaseSrc), "edit.error_state", "edit mutation error state");
assert(/historyMutationError/.test(purchaseSrc), "cancel.error_state", "cancel/history mutation error state");
assert(/forecastMutationError/.test(purchaseSrc), "forecast.error_state", "forecast/bulk mutation error state");

assert(/createInflightRef/.test(purchaseSrc), "create.inflight", "create duplicate submission guard");
assert(/receiveInflightRef/.test(purchaseSrc), "receive.inflight", "receive duplicate submission guard");
assert(/editInflightRef/.test(purchaseSrc), "edit.inflight", "edit duplicate submission guard");
assert(/cancelInflightRef/.test(purchaseSrc), "cancel.inflight", "cancel duplicate submission guard");
assert(/bulkInflightRef/.test(purchaseSrc), "bulk.inflight", "bulk duplicate submission guard");
assert(/triggerInflightRef/.test(purchaseSrc), "trigger.inflight", "forecast draft duplicate submission guard");

assert(/aria-busy=\{creatingPo\}/.test(purchaseSrc), "create.aria_busy", "create exposes aria-busy");
assert(/aria-busy=\{receivingPo\}/.test(purchaseSrc), "receive.aria_busy", "receive exposes aria-busy");
assert(/aria-busy=\{savingEdit\}/.test(purchaseSrc), "edit.aria_busy", "edit exposes aria-busy");
assert(/aria-busy=\{bulkCreating\}/.test(purchaseSrc), "bulk.aria_busy", "bulk exposes aria-busy");

assert(/getCreatePurchaseOrderLoadingLabel/.test(purchaseSrc), "create.loading", "create loading helper");
assert(/getSavePurchaseOrderLoadingLabel/.test(purchaseSrc), "edit.loading", "save loading helper");
assert(/getCancelPurchaseOrderLoadingLabel/.test(purchaseSrc), "cancel.loading", "cancel loading helper");
assert(/getReceivePurchaseOrderLoadingLabel/.test(purchaseSrc), "receive.loading", "receive loading helper");
assert(/getBulkCreateCriticalPurchaseOrdersLoadingLabel/.test(purchaseSrc), "bulk.loading", "bulk loading helper");

assert(/showToast\(\s*\"success\"/.test(purchaseSrc), "purchase.success_toast", "success uses toast");
assert(/refreshAll\(\{\s*silent:\s*true\s*\}\)/.test(purchaseSrc), "purchase.silent_refresh", "silent refresh after mutations");
assert(/frozenMutationError|Purchase Order frozen/.test(purchaseSrc), "purchase.freeze_feedback", "freeze shows action-site feedback");

assert(!/mapInventoryMutationError/.test(purchaseSrc), "purchase.no_inventory_mapper", "receive uses purchase mapper not inventory");
assert(
  !/setErrorMessage\(err\?\.message \|\| \"Failed to create purchase order\"\)/.test(purchaseSrc),
  "create.no_page_top_error",
  "create failures use ActionErrorSummary"
);
assert(
  !/setErrorMessage\(err\?\.message \|\| \"Failed to update purchase order\"\)/.test(purchaseSrc),
  "edit.no_page_top_error",
  "edit failures use ActionErrorSummary"
);
assert(
  !/setErrorMessage\(err\?\.message \|\| \"Failed to cancel purchase order\"\)/.test(purchaseSrc),
  "cancel.no_page_top_error",
  "cancel failures use ActionErrorSummary"
);
assert(
  !/setErrorMessage\(err\?\.message \|\| \"Failed to bulk create/.test(purchaseSrc),
  "bulk.no_page_top_error",
  "bulk failures use ActionErrorSummary"
);
assert(
  !/setErrorMessage\(err\?\.message \|\| \"Failed to receive purchase order\"\)/.test(purchaseSrc),
  "receive.no_page_top_error",
  "receive failures use ActionErrorSummary"
);

assert(/Purchase Order already exists/.test(mapperSrc), "map.po_exists", "PO already exists mapped");
assert(/Purchase Order frozen/.test(mapperSrc), "map.frozen", "PO frozen mapped");
assert(/Purchase Order already received/.test(mapperSrc), "map.received", "PO already received mapped");
assert(/Supplier unavailable/.test(mapperSrc), "map.supplier", "supplier unavailable mapped");
assert(/Permission denied/.test(mapperSrc), "map.permission", "permission denied mapped");
assert(/Unexpected purchase write failure/.test(mapperSrc), "map.unexpected", "unexpected write failure mapped");
assert(/Never surface raw Postgres/.test(mapperSrc) || /raw Postgres/.test(mapperSrc), "map.no_raw_pg", "mapper documents Postgres suppression");
assert(/UNEXPECTED_PURCHASE_WRITE_FAILURE/.test(mapperSrc), "map.unexpected_code", "unexpected purchase write failure code");

assert(/Creating Purchase Order\.\.\./.test(uiSrc), "ui.creating", "Creating Purchase Order label");
assert(/Saving Purchase Order\.\.\./.test(uiSrc), "ui.saving", "Saving Purchase Order label");
assert(/Cancelling Purchase Order\.\.\./.test(uiSrc), "ui.cancelling", "Cancelling Purchase Order label");
assert(/Receiving Purchase Order\.\.\./.test(uiSrc), "ui.receiving", "Receiving Purchase Order label");
assert(/Creating Critical Purchase Orders\.\.\./.test(uiSrc), "ui.bulk", "Creating Critical Purchase Orders label");

assert(!/Start Here/.test(purchaseSrc), "scope.no_start_here", "Sprint 1B Start Here not added");
assert(!/data-purchase-start-here/.test(purchaseSrc), "scope.no_start_here_marker", "no Start Here marker");
assert(!/InventoryContextStrip|PurchaseContextStrip/.test(purchaseSrc), "scope.no_context_strip", "no context strip sprint");
assert(
  /createPurchaseOrderWrite/.test(purchaseSrc) &&
    /updatePurchaseOrderWrite/.test(purchaseSrc) &&
    /cancelPurchaseOrderWrite/.test(purchaseSrc) &&
    /receivePurchaseOrderWrite/.test(purchaseSrc),
  "parity.write_apis",
  "all purchase write APIs still wired"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — purchase action feedback verified\n");
