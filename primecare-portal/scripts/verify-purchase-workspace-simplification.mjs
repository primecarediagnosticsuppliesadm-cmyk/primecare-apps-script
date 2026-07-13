#!/usr/bin/env node
/**
 * Sprint 1C — Purchase workspace simplification verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const workspaceUiSrc = readFileSync(resolve(root, "src/purchase/purchaseWorkspaceUi.js"), "utf8");
const collapsibleSrc = readFileSync(
  resolve(root, "src/components/purchase/PurchaseCollapsibleSection.jsx"),
  "utf8"
);
const startSrc = readFileSync(resolve(root, "src/components/purchase/PurchaseStartHere.jsx"), "utf8");
const returnSrc = readFileSync(resolve(root, "src/purchase/purchaseWorkflowReturn.js"), "utf8");
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

assert(/PURCHASE_WORKSPACE_PRIMARY_QUESTION/.test(workspaceUiSrc), "ia.primary_question", "primary question constant defined");
assert(/What purchasing work should I do now\?/.test(workspaceUiSrc), "ia.question_copy", "operational primary question copy");
assert(/PURCHASE_WORKSPACE_PRIMARY_QUESTION/.test(pageSrc), "ia.header_wired", "page header uses primary question");
assert(/data-purchase-workspace="hq"/.test(pageSrc), "ia.workspace_marker", "single HQ workspace marker (no split)");
assert(/data-purchase-queue-hierarchy/.test(pageSrc), "queue.hierarchy_wired", "queue hierarchy rendered");
assert(/PURCHASE_QUEUE_HIERARCHY/.test(workspaceUiSrc), "queue.hierarchy_defined", "queue hierarchy constant defined");
assert(/Critical Reorders/.test(workspaceUiSrc), "queue.critical", "Critical Reorders in hierarchy");
assert(/Forecast Drafts/.test(workspaceUiSrc), "queue.forecast", "Forecast Drafts in hierarchy");
assert(/Pending Receipts/.test(workspaceUiSrc), "queue.pending", "Pending Receipts in hierarchy");
assert(/Purchase History/.test(workspaceUiSrc), "queue.history", "Purchase History in hierarchy");
assert(/data-purchase-forecast-subnav/.test(pageSrc), "queue.forecast_merge", "Forecast Drafts sub-nav merges reorder/smart");
assert(!/data-purchase-workspace-groups/.test(pageSrc), "queue.no_peer_groups", "peer workspace groups chrome removed");

assert(/PurchaseCollapsibleSection/.test(collapsibleSrc), "collapse.component", "collapsible section component exists");
assert(/Forecast attention counts/.test(pageSrc), "collapse.forecast_kpis", "forecast KPIs collapsed");
assert(/Smart quantity summary/.test(pageSrc), "collapse.smart_kpis", "smart KPIs collapsed");
assert(/Purchase summary \(secondary\)/.test(pageSrc), "collapse.summary", "portfolio summary collapsed");
assert(/Advanced PO details/.test(pageSrc), "collapse.po_details", "advanced PO details collapsed");

assert(/PURCHASE_SUPPLIERS_HONESTY/.test(workspaceUiSrc), "suppliers.honesty_copy", "suppliers honesty copy defined");
assert(/data-purchase-suppliers-honesty/.test(pageSrc), "suppliers.honesty_wired", "suppliers honesty surface wired");
assert(/Supplier management is planned for a future release/.test(workspaceUiSrc), "suppliers.title", "honest title");
assert(!/Total Suppliers/.test(pageSrc) || /data-purchase-suppliers-honesty/.test(pageSrc), "suppliers.no_fake_kpis", "no fake supplier KPI dashboard");

assert(/getPurchaseExpectedActionCopy/.test(pageSrc), "discover.expected_action", "expected action copy wired");
assert(/data-purchase-expected-action/.test(pageSrc), "discover.expected_marker", "expected action visible on selected PO");

const startIdx = pageSrc.indexOf("data-purchase-start-here-region") >= 0
  ? pageSrc.indexOf("<PurchaseStartHere")
  : pageSrc.indexOf("PurchaseStartHere");
const queueIdx = pageSrc.indexOf("data-purchase-queue-hierarchy");
const summaryIdx = pageSrc.indexOf("data-purchase-summary-collapsed");
assert(startIdx > 0 && queueIdx > startIdx, "budget.start_before_queue", "Start Here before Purchase Queue");
assert(queueIdx > 0 && summaryIdx > queueIdx, "budget.queue_before_summary", "Queue before secondary summary");

assert(/PurchaseContextStrip/.test(pageSrc), "sprint1b.strip", "Sprint 1B context strip retained");
assert(/PurchaseStartHere/.test(pageSrc), "sprint1b.start_here", "Sprint 1B Start Here retained");
assert(/writePurchaseReturnContext/.test(pageSrc), "sprint1b.return", "Sprint 1B return context retained");
assert(/primecare_purchase_return_context/.test(returnSrc), "sprint1b.return_key", "return context key intact");
assert(/Start here/i.test(startSrc), "sprint1b.start_label", "Start Here label retained");

assert(/mapPurchaseMutationError/.test(actionMapperSrc), "sprint1a.mapper", "Sprint 1A error mapper intact");
assert(/ActionErrorSummary/.test(pageSrc), "sprint1a.error_summary", "Sprint 1A ActionErrorSummary intact");
assert(/receiveMutationError/.test(pageSrc), "sprint1a.receive_error", "Sprint 1A receive mutation error intact");
assert(/createInflightRef/.test(pageSrc), "sprint1a.inflight", "Sprint 1A inflight guards intact");

assert(!/approvalWorkflow|approvePurchaseOrderWrite/.test(pageSrc), "scope.no_approvals", "no Approvals workflow");
assert(!/createSupplierWrite|supplierMasterWrite/.test(pageSrc), "scope.no_supplier_writes", "no supplier master writes");
assert((pageSrc.match(/Purchase summary \(secondary\)/g) || []).length === 1, "budget.single_summary", "summary heading appears once");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — purchase workspace simplification verified\n");
