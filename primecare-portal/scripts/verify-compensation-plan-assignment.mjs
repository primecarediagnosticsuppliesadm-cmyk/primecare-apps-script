#!/usr/bin/env node
/**
 * Phase 5A compensation plan assignment verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/compensationPlanAdminSupabaseApi.js"), "utf8");
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

for (const column of [
  "Employee",
  "Role",
  "Current Plan",
  "Plan Version",
  "Effective From",
  "Effective To",
  "Status",
  "Assigned By",
  "Actions",
]) {
  assert(assignmentsTabSrc.includes(column), `assignments.column.${column}`, `${column} column present`);
}

assert(/Plan Assignments/.test(pageSrc), "page.assignments_tab", "Plan Assignments tab wired");
assert(/changeEmployeePlanAssignment/.test(apiSrc), "api.change_plan", "change plan API exported");
assert(/endEmployeePlanAssignment/.test(apiSrc), "api.end_assignment", "end assignment API exported");
assert(/history_preserved/.test(apiSrc), "api.history_preserved", "assignment history preserved on change");
assert(/Change Plan/.test(assignmentsTabSrc), "ui.change_plan", "change plan action present");
assert(/End Assignment/.test(assignmentsTabSrc), "ui.end_assignment", "end assignment action present");
assert(!/\.delete\(\)/.test(apiSrc), "api.no_delete", "no assignment delete path");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
