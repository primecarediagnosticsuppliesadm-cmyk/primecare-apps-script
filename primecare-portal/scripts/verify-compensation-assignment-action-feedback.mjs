#!/usr/bin/env node
/**
 * Sprint 1A — Compensation Assignments action feedback verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/compensation/CompensationActionDrawer.jsx"), "utf8");
const endDialogSrc = readFileSync(
  resolve(root, "src/components/compensation/CompensationEndAssignmentDialog.jsx"),
  "utf8"
);
const mapperSrc = readFileSync(resolve(root, "src/compensation/mapCompensationAssignmentMutationError.js"), "utf8");
const assignmentsTabSrc = readFileSync(
  resolve(root, "src/components/compensation/CompensationPlanAssignmentsTab.jsx"),
  "utf8"
);

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

assert(/mapCompensationAssignmentMutationError/.test(pageSrc), "page.assignment_mapper", "page uses assignment mutation mapper");
assert(/return \{ success: false, error:/.test(pageSrc), "page.mutation_return", "assignment handlers return structured results");
assert(!/setError\(err\?\.message \|\| \"Could not assign employee plan\"\)/.test(pageSrc), "page.no_assign_global_error", "assign no longer uses global page error");
assert(!/setError\(err\?\.message \|\| \"Could not change employee plan\"\)/.test(pageSrc), "page.no_change_global_error", "change plan no longer uses global page error");
assert(!/setError\(err\?\.message \|\| \"Could not end assignment\"\)/.test(pageSrc), "page.no_end_global_error", "end assignment no longer uses global page error");
assert(/compensationActionError/.test(pageSrc), "page.drawer_error_state", "drawer mutation error state present");
assert(/CompensationEndAssignmentDialog/.test(pageSrc), "page.end_dialog", "end assignment confirmation dialog wired");
assert(/setEndAssignmentTarget/.test(pageSrc), "page.end_confirm_flow", "end assignment opens confirmation flow");

assert(/ActionErrorSummary/.test(drawerSrc), "drawer.error_summary", "assignment drawer shows action error summary");
assert(/mutationError/.test(drawerSrc), "drawer.mutation_error_prop", "drawer accepts mutationError prop");
assert(/Assigning plan…/.test(drawerSrc), "drawer.assign_loading", "assign submit shows loading label");
assert(/Saving change…/.test(drawerSrc), "drawer.change_loading", "change submit shows loading label");
assert(/aria-busy=\{busy\}/.test(drawerSrc), "drawer.aria_busy", "submit button exposes busy state");

assert(/ActionErrorSummary/.test(endDialogSrc), "end.error_summary", "end dialog shows action error summary");
assert(/role=\"alertdialog\"/.test(endDialogSrc), "end.alertdialog", "end dialog uses alertdialog role");
assert(/Ending assignment…/.test(endDialogSrc), "end.loading_label", "end confirm shows loading label");
assert(/End compensation assignment\?/.test(endDialogSrc), "end.confirm_copy", "end assignment confirmation copy present");

assert(/employee_already_has_active_assignment/i.test(mapperSrc), "map.active_assignment", "active assignment error mapped");
assert(/compensation_plan_role_mismatch/i.test(mapperSrc), "map.role_mismatch", "role mismatch error mapped");
assert(/Employee already has an active plan/.test(mapperSrc), "map.active_title", "business title for duplicate active assignment");

assert(/End Assignment/.test(assignmentsTabSrc), "ui.end_action", "end assignment action retained");
assert(/Change Plan/.test(assignmentsTabSrc), "ui.change_action", "change plan action retained");
assert(/Assign Employee/.test(assignmentsTabSrc), "ui.assign_action", "assign employee action retained");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — compensation assignment action feedback verified\n");
