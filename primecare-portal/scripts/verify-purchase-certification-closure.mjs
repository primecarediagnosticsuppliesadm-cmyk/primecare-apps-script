#!/usr/bin/env node
/**
 * Purchase Certification Closure — PUR-CERT-005 / PUR-CERT-012 static gate.
 * Evidence packaging only. Does not mutate schema, APIs, or PO workflows.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = resolve(root, "docs/QA/modules/purchase");
const purchaseSrc = readFileSync(resolve(root, "src/pages/PurchaseOrdersPage.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/purchase/mapPurchaseMutationError.js"), "utf8");
const workspaceSrc = readFileSync(resolve(root, "src/purchase/purchaseWorkspaceUi.js"), "utf8");
const returnSrc = readFileSync(resolve(root, "src/purchase/purchaseWorkflowReturn.js"), "utf8");
const checklistSrc = readFileSync(resolve(docs, "Certification_Evidence_Checklist.md"), "utf8");
const indexSrc = readFileSync(resolve(docs, "Certification_Evidence_Index.md"), "utf8");

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
  "Sprint1A_Functional_Parity_Report.md",
  "Sprint1B_Functional_Parity_Report.md",
  "Sprint1C_Functional_Parity_Report.md",
];

for (const name of requiredDocs) {
  assert(existsSync(resolve(docs, name)), `evidence.${name}`, `${name} present`);
}

assert(
  existsSync(resolve(root, "scripts/verify-purchase-action-feedback.mjs")),
  "verify.1a_script",
  "verify-purchase-action-feedback.mjs present"
);
assert(
  existsSync(resolve(root, "scripts/verify-purchase-navigation-context.mjs")),
  "verify.1b_script",
  "verify-purchase-navigation-context.mjs present"
);
assert(
  existsSync(resolve(root, "scripts/verify-purchase-workspace-simplification.mjs")),
  "verify.1c_script",
  "verify-purchase-workspace-simplification.mjs present"
);

assert(/Founder Certification Boundary/.test(indexSrc), "boundary.section", "Founder boundary documented in evidence index");
assert(/does NOT certify/.test(indexSrc) || /does not certify/.test(indexSrc), "boundary.exclusions", "Gold exclusions documented");
assert(/Supplier Master/.test(indexSrc), "boundary.no_supplier_master", "Supplier Master excluded from Gold");
assert(/Explainability/.test(indexSrc), "boundary.no_explainability", "Explainability cards excluded from Gold");

assert(
  /verify-procurement-inventory-flow/.test(checklistSrc) && /@\//.test(checklistSrc),
  "exclusion.node_import",
  "Node @/ import exclusion documented"
);
assert(
  /not a Purchase UX|outside Purchase UX|not.*Purchase UX failure/i.test(checklistSrc),
  "exclusion.not_ux_fail",
  "exclusion not classified as Purchase UX failure"
);

assert(/ActionErrorSummary/.test(purchaseSrc), "regression.1a_errors", "Sprint 1A ActionErrorSummary retained");
assert(/mapPurchaseMutationError/.test(mapperSrc) && /mapPurchaseMutationError/.test(purchaseSrc), "regression.1a_mapper", "Sprint 1A mapper retained");
assert(/PurchaseStartHere|data-purchase-start-here|Start Here/.test(purchaseSrc), "regression.1b_start", "Sprint 1B Start Here retained");
assert(
  /writePurchaseReturnContext/.test(purchaseSrc) && /primecare_purchase_return_context/.test(returnSrc),
  "regression.1b_return",
  "Sprint 1B return context retained"
);
assert(/data-purchase-queue-hierarchy/.test(purchaseSrc), "regression.1c_queue", "Sprint 1C queue hierarchy retained");
assert(/PURCHASE_SUPPLIERS_HONESTY|data-purchase-suppliers-honesty/.test(purchaseSrc + workspaceSrc), "regression.1c_suppliers", "Sprint 1C Suppliers honesty retained");
assert(/receivePurchaseOrderWrite/.test(purchaseSrc), "parity.receive_api", "receive write path unchanged");
assert(/createPurchaseOrderWrite/.test(purchaseSrc), "parity.create_api", "create write path unchanged");

assert(!/createSupplierWrite|supplierMasterWrite|approvePurchaseOrderWrite/.test(purchaseSrc), "scope.no_future_writes", "no Supplier Master / Approvals writes invented");
assert(!/Trust Level|explainability card/i.test(purchaseSrc), "scope.no_explainability_cards", "no explainability Constitution cards invented in Closure");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — purchase certification closure verified\n");
