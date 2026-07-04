#!/usr/bin/env node
/**
 * Phase 4B payroll plan resolution verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCompensationPreview } from "../src/compensation/compensationCalculationEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");

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

const preview = calculateCompensationPreview({
  period: { id: "p1", tenant_id: "t1", period_start: "2026-06-01", period_end: "2026-06-30" },
  payments: [{ payment_id: "P1", tenant_id: "t1", lab_id: "L1", payment_date: "2026-06-05", amount_received: 2000, agent_id: "A1" }],
  planAssignments: [{
    id: "as1",
    tenant_id: "t1",
    plan_id: "plan-v2",
    agent_id: "A1",
    agent_name: "Agent One",
    start_date: "2026-01-01",
    assignment_status: "active",
  }],
  compensationPlans: [{
    id: "plan-v2",
    plan_code: "AGENT_YEAR1_BASELINE",
    version: "v2",
    base_salary: 20000,
    fuel_allowance: 5000,
    mobile_allowance: 500,
    commission_rate_bps: 300,
  }],
});

assert(preview.commissionEntries[0]?.metadata?.plan_version === "v2", "plan.version_on_commission", "plan version captured on commission entry");
assert(
  preview.payrollRunLines[0]?.calculation_snapshot?.plan_version === "v2",
  "plan.version_on_line",
  "plan version captured on payroll line snapshot"
);
assert(/compensation_plans/.test(apiSrc) && /compensation_plan_assignments/.test(apiSrc), "api.plan_reads", "API reads plans and assignments");
assert(/plan_versions/.test(apiSrc), "api.plan_versions_audit", "plan versions stored in run metadata");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
