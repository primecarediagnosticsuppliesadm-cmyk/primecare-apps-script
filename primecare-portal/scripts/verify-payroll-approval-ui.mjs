#!/usr/bin/env node
/**
 * Phase 6A payroll approval workflow UI verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const toolbarSrc = readFileSync(
  resolve(root, "src/components/compensation/PayrollWorkflowToolbar.jsx"),
  "utf8"
);
const uiSrc = readFileSync(resolve(root, "src/payroll/payrollWorkflowUi.js"), "utf8");

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

assert(/PayrollWorkflowToolbar/.test(pageSrc), "page.toolbar", "Executive Compensation wires payroll workflow toolbar");
assert(/handlePayrollWorkflowAction/.test(pageSrc), "page.handler", "workflow action handler present");
assert(/Payroll Periods/.test(pageSrc) && /Payroll Preview/.test(pageSrc), "page.tabs", "period and preview tabs present");
assert(/Payroll Workflow/.test(toolbarSrc), "ui.title", "workflow toolbar title present");
assert(/buildPayrollWorkflowActions/.test(uiSrc), "ui.actions", "status-based action builder present");
assert(/adminViewOnly/.test(uiSrc), "ui.admin_readonly", "admin view-only contract declared");

for (const label of ["Submit Preview", "Approve", "Reject", "Lock Payroll", "Generate Export", "Mark Paid Evidence"]) {
  assert(toolbarSrc.includes(label) || uiSrc.includes(label), `action.${label}`, `${label} action declared`);
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
