#!/usr/bin/env node
/**
 * Phase 5B agent compensation plan history verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentCompensation360Model } from "../src/compensation/agentCompensation360Model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/AgentCompensation360Panel.jsx"),
  "utf8"
);
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/agentCompensation360SupabaseApi.js"), "utf8");

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

for (const label of ["Assigned Plan", "Plan History", "Effective From", "Effective To", "Change Plan"]) {
  assert(panelSrc.includes(label), `ui.${label}`, `${label} present`);
}

assert(/changeEmployeePlanAssignment/.test(pageSrc), "page.change_plan", "360 reuses existing change plan workflow");
assert(/compensation_plan_assignments/.test(apiSrc), "api.assignments", "360 loader reads assignment history");
assert(/onChangePlan/.test(panelSrc), "ui.change_action", "change plan action wired");

const model = buildAgentCompensation360Model({
  agentId: "QA_AGENT_001",
  assignments: [
    {
      id: "asg-1",
      plan_id: "p1",
      assignment_status: "active",
      start_date: "2026-01-01",
      assigned_by: "exec-1",
    },
    {
      id: "asg-0",
      plan_id: "p0",
      assignment_status: "ended",
      start_date: "2025-01-01",
      end_date: "2025-12-31",
      assigned_by: "hr-1",
    },
  ],
  plans: [
    { id: "p1", plan_code: "AGENT_YEAR1_BASELINE", version: 1, status: "active" },
    { id: "p0", plan_code: "AGENT_YEAR1_BASELINE", version: 0, status: "retired" },
  ],
});
assert(model.planHistory.length === 2, "model.history", "plan history preserves prior assignments");
assert(model.activeAssignment?.id === "asg-1", "model.active", "active assignment resolved");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
