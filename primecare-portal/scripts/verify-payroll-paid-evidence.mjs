#!/usr/bin/env node
/**
 * Phase 6A payroll paid evidence UI verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_UI_ACTION_IDS,
  buildPayrollWorkflowActions,
} from "../src/payroll/payrollWorkflowUi.js";
import { PAYROLL_STATUSES } from "../src/payroll/payrollDomainWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const toolbarSrc = readFileSync(
  resolve(root, "src/components/compensation/PayrollWorkflowToolbar.jsx"),
  "utf8"
);
const apiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");

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

const exportedActions = buildPayrollWorkflowActions({
  status: PAYROLL_STATUSES.EXPORTED,
  hasRun: true,
  hasRunLines: true,
  role: "executive",
}).map((row) => row.id);
assert(exportedActions.includes(PAYROLL_UI_ACTION_IDS.MARK_PAID), "actions.exported.paid", "exported exposes mark paid evidence");
assert(/recordPayrollPaidWrite/.test(pageSrc), "page.paid_api", "page calls recordPayrollPaidWrite");
assert(/Mark Paid Evidence/.test(toolbarSrc), "ui.paid_label", "paid evidence action label present");
assert(/Paid Date/.test(toolbarSrc), "ui.paid_date", "paid date field required");
assert(/Reference/.test(toolbarSrc), "ui.paid_reference", "paid reference field required");
assert(/no_payment_row_created:\s*true/.test(apiSrc), "api.no_payment_row", "paid evidence creates no payment row");
assert(/no_bank_disbursement_created:\s*true/.test(apiSrc), "api.no_bank", "paid evidence creates no bank disbursement");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
