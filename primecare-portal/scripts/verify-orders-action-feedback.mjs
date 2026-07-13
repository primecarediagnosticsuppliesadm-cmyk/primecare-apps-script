#!/usr/bin/env node
/**
 * Sprint 1A — HQ order action feedback verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/orders/mapOrderMutationError.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/orders/ordersActionUi.js"), "utf8");

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

assert(/mapOrderMutationError/.test(pageSrc), "page.mutation_mapper", "page uses order mutation mapper");
assert(/statusMutationError/.test(pageSrc), "page.mutation_error_state", "status mutation error state present");
assert(/statusActionInflightRef/.test(pageSrc), "page.inflight_guard", "duplicate submission guard present");
assert(/pendingStatusAction/.test(pageSrc), "page.pending_action", "pending status action tracked");
assert(/ActionErrorSummary/.test(pageSrc), "page.error_summary", "Status Actions show ActionErrorSummary");
assert(/setStatusMutationError\(null\)/.test(pageSrc), "page.clear_error", "mutation error cleared on open/submit");
assert(!/setError\(err\.message \|\| \"Failed to update order status\"\)/.test(pageSrc), "page.no_page_top_status_error", "status failures no longer use page-top setError");
assert(/showToast\(\"success\"/.test(pageSrc), "page.success_toast", "status success uses toast");
assert(/patchOrderStatusInLists/.test(pageSrc), "page.patch_affected_order", "success patches affected order in list");
assert(/aria-busy=\{updatingStatus && pendingStatusAction === \"Processing\"\}/.test(pageSrc), "page.aria_busy_processing", "Processing button exposes aria-busy");
assert(/aria-busy=\{updatingStatus && pendingStatusAction === \"Fulfilled\"\}/.test(pageSrc), "page.aria_busy_fulfilled", "Fulfilled button exposes aria-busy");
assert(/aria-busy=\{updatingStatus && pendingStatusAction === \"Cancelled\"\}/.test(pageSrc), "page.aria_busy_cancelled", "Cancelled button exposes aria-busy");
assert(/aria-busy=\{updatingStatus && pendingStatusAction === \"Placed\"\}/.test(pageSrc), "page.aria_busy_placed", "Reset button exposes aria-busy");
assert(/getOrderStatusActionLoadingLabel/.test(pageSrc), "page.loading_helper", "page uses loading label helper");

assert(/Marking Processing…/.test(uiSrc), "ui.processing_loading", "Processing loading label defined");
assert(/Fulfilling Order…/.test(uiSrc), "ui.fulfilled_loading", "Fulfilled loading label defined");
assert(/Cancelling Order…/.test(uiSrc), "ui.cancelled_loading", "Cancelled loading label defined");
assert(/Resetting Order…/.test(uiSrc), "ui.placed_loading", "Reset loading label defined");

assert(/Order already fulfilled/.test(mapperSrc), "map.already_fulfilled", "already fulfilled mapped");
assert(/Order cannot be cancelled/.test(mapperSrc), "map.cannot_cancel", "cannot cancel mapped");
assert(/Order no longer exists/.test(mapperSrc), "map.not_found", "order not found mapped");
assert(/Inventory unavailable/.test(mapperSrc), "map.inventory", "inventory unavailable mapped");
assert(/Permission denied/.test(mapperSrc), "map.permission", "permission denied mapped");
assert(/Unexpected write failure/.test(mapperSrc), "map.unexpected", "unexpected write failure mapped");

assert(!/from \"@\/pages\/LabOrderingPage/.test(pageSrc), "scope.no_lab_ordering", "Lab Ordering page not imported");
assert(!/createOrderWrite/.test(pageSrc), "scope.no_create_order", "OrdersPage does not call createOrderWrite");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — orders action feedback verified\n");
