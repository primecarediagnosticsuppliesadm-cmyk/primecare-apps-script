#!/usr/bin/env node
/**
 * Phase 6A payroll workflow action wiring verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_UI_ACTION_IDS,
  buildPayrollWorkflowActions,
  payrollWorkflowPermissions,
} from "../src/payroll/payrollWorkflowUi.js";
import { PAYROLL_STATUSES } from "../src/payroll/payrollDomainWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
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

const executive = payrollWorkflowPermissions("executive");
const hr = payrollWorkflowPermissions("hr");
const admin = payrollWorkflowPermissions("admin");

assert(executive.canApprove && executive.canLock && executive.canExport && executive.canMarkPaid, "role.executive", "Executive has full workflow actions");
assert(hr.canSubmit && !hr.canApprove && !hr.canLock && !hr.canExport && !hr.canMarkPaid, "role.hr", "HR can submit only");
assert(admin.adminViewOnly && !admin.canSubmit && !admin.canApprove, "role.admin", "Admin is view-only");

const draftActions = buildPayrollWorkflowActions({
  status: PAYROLL_STATUSES.DRAFT,
  hasRun: true,
  hasRunLines: true,
  role: "executive",
}).map((row) => row.id);
assert(draftActions.includes(PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW), "actions.draft.generate", "draft exposes generate preview");
assert(draftActions.includes(PAYROLL_UI_ACTION_IDS.SUBMIT), "actions.draft.submit", "draft with lines exposes submit");

const submittedActions = buildPayrollWorkflowActions({
  status: PAYROLL_STATUSES.SUBMITTED,
  hasRun: true,
  hasRunLines: true,
  role: "executive",
}).map((row) => row.id);
assert(submittedActions.includes(PAYROLL_UI_ACTION_IDS.APPROVE), "actions.submitted.approve", "submitted exposes approve");
assert(submittedActions.includes(PAYROLL_UI_ACTION_IDS.REJECT), "actions.submitted.reject", "submitted exposes reject");

const paidActions = buildPayrollWorkflowActions({
  status: PAYROLL_STATUSES.PAID,
  hasRun: true,
  hasRunLines: true,
  role: "executive",
});
assert(paidActions.length === 0, "actions.paid.view_only", "paid has no workflow actions");

for (const [fn, actionId] of [
  ["submitPayrollRunWrite", PAYROLL_UI_ACTION_IDS.SUBMIT],
  ["approvePayrollRunWrite", PAYROLL_UI_ACTION_IDS.APPROVE],
  ["rejectPayrollRunWrite", PAYROLL_UI_ACTION_IDS.REJECT],
  ["lockPayrollRunWrite", PAYROLL_UI_ACTION_IDS.LOCK],
  ["generatePayrollExportWrite", PAYROLL_UI_ACTION_IDS.EXPORT],
  ["recordPayrollPaidWrite", PAYROLL_UI_ACTION_IDS.MARK_PAID],
]) {
  assert(pageSrc.includes(fn), `page.api.${fn}`, `${fn} wired in page`);
  assert(apiSrc.includes(`export async function ${fn}`), `api.${fn}`, `${fn} exported`);
  if (actionId === PAYROLL_UI_ACTION_IDS.MARK_PAID) {
    assert(pageSrc.includes("MARK_PAID"), `page.action.${actionId}`, `${actionId} action id referenced`);
  } else {
    assert(pageSrc.includes(actionId), `page.action.${actionId}`, `${actionId} action id referenced`);
  }
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
