#!/usr/bin/env node
/**
 * Phase 4A payroll preview UI verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");

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
  "Agent",
  "Compensation Plan",
  "Salary",
  "Fuel",
  "Mobile",
  "Collected Cash",
  "Commission",
  "Bonuses",
  "Adjustments",
  "Recoveries",
  "Net Preview",
  "Lifecycle Status",
  "Rule Version",
  "Plan Version",
  "Calculated At",
]) {
  assert(pageSrc.includes(column), `preview.column.${column}`, `${column} column declared`);
}

assert(/previewRows/.test(modelSrc), "model.preview_rows", "preview rows built in model");
assert(/Search agent, plan, or period/.test(pageSrc), "preview.search", "search control present");
assert(/All lifecycle statuses/.test(pageSrc), "preview.filter", "lifecycle filter present");
assert(/toggleSort/.test(pageSrc), "preview.sort", "sortable preview table present");
assert(/PayrollWorkflowToolbar/.test(pageSrc), "preview.workflow_toolbar", "payroll preview exposes workflow toolbar");
assert(/handlePayrollWorkflowAction/.test(pageSrc), "preview.workflow_handler", "workflow handler wired");
assert(!/\bSalary editing\b|\bBonus editing\b/.test(pageSrc), "preview.no_edit_actions", "preview UI has no salary/bonus edit actions");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
