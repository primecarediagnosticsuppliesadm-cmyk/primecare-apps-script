#!/usr/bin/env node
/**
 * Phase 6A payroll export UI verification.
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
const uiSrc = readFileSync(resolve(root, "src/payroll/payrollWorkflowUi.js"), "utf8");
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

const lockedActions = buildPayrollWorkflowActions({
  status: PAYROLL_STATUSES.LOCKED,
  hasRun: true,
  hasRunLines: true,
  role: "executive",
}).map((row) => row.id);
assert(lockedActions.includes(PAYROLL_UI_ACTION_IDS.EXPORT), "actions.locked.export", "locked exposes generate export");
assert(/generatePayrollExportWrite/.test(pageSrc), "page.export_api", "page calls generatePayrollExportWrite");
assert(/Generate Export/.test(uiSrc), "ui.export_label", "export action label present");
assert(/payroll_exports/.test(apiSrc), "api.export_table", "export metadata persisted");
assert(/no_bank_file_created:\s*true/.test(apiSrc), "api.no_bank", "export creates no bank file");
assert(/no_gl_posting_created:\s*true/.test(apiSrc), "api.no_gl", "export creates no GL posting");
assert(!/download|blob|saveAs/.test(toolbarSrc), "ui.no_download_required", "export UI does not require file download");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
