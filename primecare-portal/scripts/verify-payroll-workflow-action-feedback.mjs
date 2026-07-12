#!/usr/bin/env node
/**
 * Sprint 1B — Payroll workflow action feedback verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const toolbarSrc = readFileSync(resolve(root, "src/components/compensation/PayrollWorkflowToolbar.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/payroll/mapPayrollWorkflowMutationError.js"), "utf8");
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

assert(/mapPayrollWorkflowMutationError/.test(pageSrc), "page.payroll_mapper", "page uses payroll mutation mapper");
assert(/return \{ success: false, error:/.test(pageSrc), "page.mutation_return", "payroll handlers return structured results");
assert(!/setError\(\"Generate a payroll preview before running workflow actions\.\"\)/.test(pageSrc), "page.no_preview_global_error", "preview-required no longer uses global page error");
assert(!/setError\(err\?\.message \|\| \"Payroll workflow action failed\"\)/.test(pageSrc), "page.no_workflow_global_error", "workflow no longer uses global page error");
assert(!/setError\(err\?\.message \|\| \"Could not generate payroll preview\"\)/.test(pageSrc), "page.no_generate_global_error", "generate preview no longer uses global page error");

assert(/ActionErrorSummary/.test(toolbarSrc), "toolbar.error_summary", "toolbar shows action error summary");
assert(!/window\.confirm/.test(toolbarSrc), "toolbar.no_window_confirm", "window.confirm removed from toolbar");
assert(/role=\"alertdialog\"/.test(toolbarSrc), "toolbar.alertdialog", "confirm surfaces use alertdialog");
assert(/Generating payroll preview…/.test(toolbarSrc) || /Generating payroll preview…/.test(uiSrc), "toolbar.generate_loading", "generate preview loading label present");
assert(/Approving payroll…/.test(uiSrc), "ui.approve_loading", "approve loading label present");
assert(/Locking payroll…/.test(uiSrc), "ui.lock_loading", "lock loading label present");
assert(/Exporting payroll…/.test(uiSrc), "ui.export_loading", "export loading label present");
assert(/Marking payroll paid…/.test(uiSrc), "ui.paid_loading", "mark paid loading label present");
assert(/result\?\.success/.test(toolbarSrc), "toolbar.await_success", "toolbar awaits success before closing modal");
assert(/setModalError/.test(toolbarSrc), "toolbar.modal_error", "modal-local error state present");
assert(/aria-busy/.test(toolbarSrc), "toolbar.aria_busy", "buttons expose busy state");

assert(/payroll_preview_required/i.test(mapperSrc), "map.preview_required", "preview required error mapped");
assert(/payroll_.*_forbidden_for_/i.test(mapperSrc), "map.forbidden", "forbidden error mapped");
assert(/payroll_invalid_transition_/i.test(mapperSrc), "map.invalid_transition", "invalid transition mapped");

for (const label of ["Submit Preview", "Approve", "Reject", "Lock Payroll", "Generate Export", "Mark Paid Evidence"]) {
  assert(toolbarSrc.includes(label) || uiSrc.includes(label), `action.${label}`, `${label} action retained`);
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — payroll workflow action feedback verified\n");
