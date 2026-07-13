#!/usr/bin/env node
/**
 * Sprint 1B — Purchase navigation context & continuity verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const startSrc = readFileSync(resolve(root, "src/components/purchase/PurchaseStartHere.jsx"), "utf8");
const stripSrc = readFileSync(resolve(root, "src/components/purchase/PurchaseContextStrip.jsx"), "utf8");
const ctxUiSrc = readFileSync(resolve(root, "src/purchase/purchaseContextUi.js"), "utf8");
const returnSrc = readFileSync(resolve(root, "src/purchase/purchaseWorkflowReturn.js"), "utf8");
const stockSrc = readFileSync(resolve(root, "src/pages/StockPage.jsx"), "utf8");
const ordersSrc = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const actionMapperSrc = readFileSync(resolve(root, "src/purchase/mapPurchaseMutationError.js"), "utf8");

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
assert(/Create Purchase Orders/.test(ctxUiSrc), "start_here.create", "Create Purchase Orders action");
assert(/Receive Pending Deliveries/.test(ctxUiSrc), "start_here.receive", "Receive Pending Deliveries action");
assert(/Review Critical Reorders/.test(ctxUiSrc), "start_here.critical", "Review Critical Reorders action");
assert(/Investigate Blocked Purchase Orders/.test(ctxUiSrc), "start_here.blocked", "Investigate Blocked Purchase Orders action");
assert(/buildPurchaseStartHereActions/.test(startSrc), "start_here.builder", "Start Here uses shared builder");
assert(
  /pendingReceiptCount/.test(startSrc) && /criticalCount/.test(startSrc) && /blockedCount/.test(startSrc),
  "start_here.existing_counts",
  "Start Here uses existing counts"
);
assert(!/Math\.random|priorityScore|fakePercent/.test(ctxUiSrc + startSrc), "start_here.no_invented_math", "no invented prioritization");
assert(!/statistics-only|KPI card/.test(startSrc), "start_here.no_stats_cards", "Start Here is action-oriented");

assert(/PurchaseContextStrip/.test(pageSrc), "context.strip_wired", "Purchase page wires context strip");
assert(/Viewing:/.test(stripSrc), "context.strip_viewing", "strip uses Viewing label");
assert(/buildPurchaseContextParts/.test(ctxUiSrc), "context.parts_builder", "context parts builder exists");
assert(/Writes frozen/.test(ctxUiSrc), "context.freeze_part", "freeze state included in strip parts");

assert(/aria-selected=\{isSelected\}/.test(pageSrc), "selection.aria", "selected row exposes aria-selected");
assert(/ring-indigo-400/.test(pageSrc), "selection.visual", "selected row has explicit visual state");
assert(/Selected Purchase Order/.test(pageSrc), "selection.detail", "selected PO panel present");
assert(/FOCUS_OUTSIDE_FILTERS/.test(ctxUiSrc) || /outside current filters/.test(ctxUiSrc), "focus.outside_copy", "outside-filter recovery copy");
assert(/Clear Filters/.test(pageSrc) || /clearLabel/.test(pageSrc), "focus.clear_filters", "Clear Filters recovery wired");
assert(/Return to Purchase/.test(ctxUiSrc), "focus.return_purchase", "Return to Purchase copy defined");
assert(/data-purchase-focus-outside/.test(pageSrc), "focus.banner_wired", "outside-filter banner wired");

assert(/writePurchaseReturnContext/.test(pageSrc), "return.write", "Purchase stores return context before leave");
assert(/primecare_purchase_return_context/.test(returnSrc), "return.key", "session key defined");
assert(/armPurchaseReturnRestore/.test(returnSrc), "return.arm", "Back to Purchase arms restore");
assert(/consumePurchaseReturnContextIfArmed/.test(pageSrc), "return.restore", "Purchase restores armed context");
assert(/Back to Purchase/.test(stockSrc), "return.inventory_cta", "Inventory shows Back to Purchase");
assert(/Back to Purchase/.test(ordersSrc), "return.orders_cta", "Orders shows Back to Purchase");
assert(/Back to Inventory/.test(pageSrc), "return.inventory_from_purchase", "Purchase still shows Back to Inventory");

assert(/buildPurchaseListEmptyCopy/.test(pageSrc), "empty.differentiated", "differentiated empty states wired");
assert(/No search results/.test(ctxUiSrc), "empty.search", "search empty copy");
assert(/No pending receipts/.test(ctxUiSrc), "empty.pending", "pending receipts empty copy");
assert(/No critical purchases/.test(ctxUiSrc), "empty.critical", "critical empty copy");
assert(/No purchase orders yet/.test(ctxUiSrc), "empty.none", "no POs copy");
assert(/No filter results/.test(ctxUiSrc), "empty.filter", "filter empty copy");

assert(/Purchase summary \(secondary\)/.test(pageSrc) || /data-purchase-summary-collapsed/.test(pageSrc), "budget.summary_collapsed", "KPI summary collapsed secondary");
assert(
  /PURCHASE_WORKSPACE_PRIMARY_QUESTION/.test(pageSrc) ||
    /What purchasing work needs my attention/.test(pageSrc),
  "budget.primary_question",
  "primary question in header"
);
assert(/PurchaseStartHere/.test(pageSrc) && /data-purchase-start-here/.test(startSrc), "budget.start_here_wired", "Start Here component wired");

assert(/ActionErrorSummary/.test(pageSrc), "sprint1a.error_summary", "Sprint 1A ActionErrorSummary intact");
assert(/receiveMutationError/.test(pageSrc), "sprint1a.receive_error", "Sprint 1A receive mutation error intact");
assert(/mapPurchaseMutationError/.test(actionMapperSrc), "sprint1a.mapper", "Sprint 1A purchase error mapper intact");
assert(/createInflightRef/.test(pageSrc) && /receiveInflightRef/.test(pageSrc), "sprint1a.inflight", "Sprint 1A inflight guards intact");

assert(!/approvalWorkflow|approvePurchaseOrderWrite/.test(pageSrc), "scope.no_approvals", "no Approvals workflow invented");
assert(!/supplierMasterWrite|createSupplierWrite/.test(pageSrc), "scope.no_supplier_master", "no supplier master writes");
assert(!/explainabilityTrustLevel|PUR-CERT-015/.test(pageSrc), "scope.no_explainability", "no explainability cards sprint");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — purchase navigation context verified\n");
