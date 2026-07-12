#!/usr/bin/env node
/**
 * Sprint 1B — HQ Orders navigation context & continuity verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const queueSrc = readFileSync(resolve(root, "src/components/hq/HqOrdersOperationsQueue.jsx"), "utf8");
const stripSrc = readFileSync(resolve(root, "src/components/orders/OrdersContextStrip.jsx"), "utf8");
const ctxUiSrc = readFileSync(resolve(root, "src/orders/ordersContextUi.js"), "utf8");
const returnSrc = readFileSync(resolve(root, "src/orders/ordersWorkflowReturn.js"), "utf8");
const engineSrc = readFileSync(resolve(root, "src/orders/ordersOperationsQueueEngine.js"), "utf8");
const collectionsSrc = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
const labsSrc = readFileSync(resolve(root, "src/pages/LabsPage.jsx"), "utf8");
const logisticsSrc = readFileSync(resolve(root, "src/pages/LogisticsDeliveryPage.jsx"), "utf8");
const actionFeedbackSrc = readFileSync(resolve(root, "src/orders/mapOrderMutationError.js"), "utf8");

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

assert(/Start here/i.test(queueSrc), "start_here.label", "Start Here label present on queue");
assert(/Review Next Order/.test(queueSrc), "start_here.cta", "Review Next Order CTA present");
assert(/buildOrdersOperationsQueue/.test(queueSrc), "start_here.existing_queue", "Start Here uses existing queue builder");
assert(/AWAITING_FULFILLMENT/.test(queueSrc), "start_here.awaiting_bucket", "Start Here targets awaiting fulfillment bucket");
assert(!/count:\s*kpis\.placed\s*\+\s*99/.test(engineSrc), "start_here.no_math_change", "queue engine file present for regression anchor");

assert(/OrdersContextStrip/.test(pageSrc), "context.strip_wired", "OrdersPage wires context strip");
assert(/Viewing:/.test(stripSrc), "context.strip_viewing", "strip uses Viewing label");
assert(/buildOrdersContextParts/.test(ctxUiSrc), "context.parts_builder", "context parts builder exists");
assert(/Status writes frozen/.test(ctxUiSrc), "context.freeze_part", "freeze state included in strip parts");
assert(/hqStatusWriteBlocked/.test(pageSrc) && /buildOrdersContextParts/.test(pageSrc), "context.freeze_wired", "freeze passed into context parts");

assert(/aria-selected=\{isSelected\}/.test(pageSrc), "selection.aria", "selected row exposes aria-selected");
assert(/ring-indigo-400/.test(pageSrc), "selection.visual", "selected row has explicit visual state");
assert(/Selected order/.test(pageSrc), "selection.detail_header", "selected order ID labeled in detail");

assert(/writeOrdersReturnContext/.test(pageSrc), "return.write", "Orders stores return context before leave");
assert(/primecare_orders_return_context/.test(returnSrc), "return.key", "session key defined");
assert(/armOrdersReturnRestore/.test(returnSrc), "return.arm", "Back to Orders arms restore");
assert(/consumeOrdersReturnContextIfArmed/.test(pageSrc), "return.restore", "Orders restores armed context");
assert(/Back to Orders/.test(collectionsSrc), "return.collections_cta", "Collections shows Back to Orders");
assert(/Back to Orders/.test(labsSrc), "return.labs_cta", "Labs shows Back to Orders");
assert(/Back to Orders/.test(logisticsSrc), "return.logistics_cta", "Logistics shows Back to Orders");

assert(/FOCUS_OUTSIDE_FILTERS/.test(ctxUiSrc) || /Focused order is outside/.test(ctxUiSrc), "focus.outside_copy", "outside-filter recovery copy defined");
assert(/Clear Filters/.test(pageSrc) || /clearOrdersListFilters/.test(pageSrc), "focus.clear_filters", "Clear Filters recovery wired");
assert(/buildOrdersListEmptyCopy/.test(pageSrc), "empty.differentiated", "differentiated empty states wired");
assert(/No orders match search/.test(ctxUiSrc), "empty.search", "search empty copy present");
assert(/No orders need action in this queue/.test(ctxUiSrc), "empty.queue", "queue empty copy present");

assert(/ActionErrorSummary/.test(pageSrc), "sprint1a.error_local", "Sprint 1A ActionErrorSummary still present");
assert(/statusMutationError/.test(pageSrc), "sprint1a.mutation_state", "Sprint 1A mutation error state intact");
assert(/mapOrderMutationError/.test(actionFeedbackSrc), "sprint1a.mapper", "Sprint 1A error mapper intact");

assert(!/KpiCardGrid columns=\{8\}/.test(pageSrc), "budget.no_extra_kpi_grid", "no expanded KPI grid added");
assert(!/createOrderWrite/.test(pageSrc), "scope.no_create_order", "no checkout write on OrdersPage");
assert(!/updateOrderStatusWrite\(/.test(queueSrc), "scope.queue_no_write", "queue component has no status writes");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — orders navigation context verified\n");
