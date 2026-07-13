#!/usr/bin/env node
/**
 * Phase 3B plan/rule versioning verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCompensationPreview } from "../src/compensation/compensationCalculationEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const engineSrc = readFileSync(resolve(root, "src/compensation/compensationCalculationEngine.js"), "utf8");
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

const calculatedAt = "2026-07-04T10:30:00.000Z";
const preview = calculateCompensationPreview({
  period: {
    id: "period-version",
    tenant_id: "tenant-1",
    period_start: "2026-06-01",
    period_end: "2026-06-30",
  },
  payments: [
    {
      payment_id: "PAY-V",
      tenant_id: "tenant-1",
      lab_id: "LAB-1",
      payment_date: "2026-06-10",
      amount_received: 1000,
      agent_id: "A1",
    },
  ],
  planAssignments: [
    {
      id: "assign-v",
      tenant_id: "tenant-1",
      plan_id: "plan-v",
      agent_id: "A1",
      start_date: "2026-06-01",
      assignment_status: "active",
    },
  ],
  compensationPlans: [
    {
      id: "plan-v",
      plan_code: "AGENT_YEAR1_BASELINE",
      version: "v7",
      commission_rate_bps: 300,
      rules_json: { ruleVersion: "RULE-V7" },
    },
  ],
  calculatedAt,
});

const commission = preview.commissionEntries[0];
const line = preview.payrollRunLines[0];
assert(commission.metadata.plan_id === "plan-v", "commission.plan_id", "commission stores plan_id");
assert(commission.metadata.plan_version === "v7", "commission.plan_version", "commission stores plan_version");
assert(commission.rule_version === "RULE-V7", "commission.rule_version", "commission stores rule_version");
assert(commission.metadata.calculated_at === calculatedAt, "commission.calculated_at", "commission stores calculated_at");
assert(line.calculation_snapshot.plan_id === "plan-v", "line.plan_id", "line stores plan_id");
assert(line.calculation_snapshot.plan_version === "v7", "line.plan_version", "line stores plan_version");
assert(line.calculation_snapshot.rule_version === "RULE-V7", "line.rule_version", "line stores rule_version");
assert(line.calculation_snapshot.calculated_at === calculatedAt, "line.calculated_at", "line stores calculated_at");
assert(preview.payrollRun.totals_json.rule_version, "run.rule_version", "run stores rule_version");
assert(preview.payrollRun.totals_json.calculated_at === calculatedAt, "run.calculated_at", "run stores calculated_at");

for (const token of ["plan_id", "plan_version", "rule_version", "calculated_at"]) {
  assert(engineSrc.includes(token), `engine.${token}`, `${token} emitted by engine`);
  assert(apiSrc.includes(token), `api.${token}`, `${token} persisted by API`);
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
