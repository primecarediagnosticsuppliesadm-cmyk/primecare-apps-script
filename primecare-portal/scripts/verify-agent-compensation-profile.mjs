#!/usr/bin/env node
/**
 * Phase 5B Agent Compensation 360 profile verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentCompensation360Model } from "../src/compensation/agentCompensation360Model.js";
import { EMPLOYEE_COMP_360_SECTIONS } from "../src/compensation/employeeCompensation360Workflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/EmployeeCompensation360Panel.jsx"),
  "utf8"
);
const apiSrc = readFileSync(resolve(root, "src/api/employeeCompensation360SupabaseApi.js"), "utf8");

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

for (const section of EMPLOYEE_COMP_360_SECTIONS) {
  assert(panelSrc.includes(section) || panelSrc.includes(section.replace(/History$/, " History")), `sections.${section}`, `${section} section wired`);
}

for (const label of [
  "Name",
  "Profile ID",
  "Role",
  "Status",
  "Territory",
  "Manager",
  "Join Date",
  "Compensation Plan",
  "Current Version",
  "Salary",
  "Fuel",
  "Mobile",
  "Commission %",
  "Promotion Status",
  "Collection Efficiency",
  "Current Month Collections",
  "Current Month Commission",
]) {
  assert(panelSrc.includes(label), `overview.${label}`, `${label} overview field present`);
}

assert(
  /EmployeeCompensation360(?:Panel|Drawer)/.test(pageSrc),
  "page.panel",
  "Executive Compensation uses Employee Compensation 360 panel or drawer"
);
assert(/loadEmployeeCompensation360Read/.test(pageSrc), "page.loader", "360 read loader wired");
assert(/Employee Compensation 360/.test(panelSrc), "ui.title", "360 panel title present");
assert(/buildEmployeeCompensation360Model/.test(apiSrc), "api.model", "360 API builds domain model");
assert(/assertEmployeeCompensation360Access/.test(apiSrc), "api.access", "360 API enforces access guard");

const model = buildAgentCompensation360Model({
  agentId: "QA_AGENT_001",
  profile: { agent_name: "QA Agent One", role: "agent", active: true, created_at: "2026-01-01" },
  assignments: [{ id: "a1", plan_id: "p1", assignment_status: "active", start_date: "2026-01-01" }],
  plans: [
    {
      id: "p1",
      plan_code: "AGENT_YEAR1_BASELINE",
      version: 1,
      base_salary: 25000,
      fuel_allowance: 3000,
      mobile_allowance: 500,
      commission_rate_bps: 300,
      status: "active",
    },
  ],
});
assert(model.overview.name === "QA Agent One", "model.overview", "overview model builds employee identity");
assert(model.overview.salaryLabel.includes("25"), "model.salary", "overview includes salary");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
