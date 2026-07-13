#!/usr/bin/env node
/**
 * Phase 5A compensation plan management verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/compensationPlanAdminSupabaseApi.js"), "utf8");
const plansTabSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlansTab.jsx"), "utf8");

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
  "Plan Name",
  "Role",
  "Version",
  "Status",
  "Salary",
  "Fuel Allowance",
  "Mobile Allowance",
  "Commission %",
  "Promotion Salary",
  "Promotion Commission %",
  "Effective From",
  "Effective To",
  "Assigned Employees",
  "Created By",
  "Created Date",
  "Actions",
]) {
  assert(plansTabSrc.includes(column), `plans.column.${column}`, `${column} column present`);
}

assert(/Compensation Plans/.test(pageSrc), "page.plans_tab", "Compensation Plans tab wired");
assert(/createCompensationPlan/.test(apiSrc), "api.create_plan", "plan create API exported");
assert(/duplicateCompensationPlan/.test(apiSrc), "api.duplicate_plan", "duplicate API exported");
assert(/deactivateCompensationPlan/.test(apiSrc), "api.deactivate_plan", "deactivate API exported");
assert(/saveCompensationPlanAdmin/.test(apiSrc), "api.save_plan", "save API exported");
assert(!/\.delete\(\)/.test(apiSrc), "api.no_delete", "no plan delete path");
assert(!/from\("(payments|orders|invoices|ar_credit_control)"\)\s*\.(update|insert|delete|upsert)/.test(apiSrc), "api.no_finance_writes", "admin API does not write finance tables");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
