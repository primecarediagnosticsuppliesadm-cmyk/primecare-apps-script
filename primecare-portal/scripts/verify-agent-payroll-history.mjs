#!/usr/bin/env node
/**
 * Phase 5B agent payroll history verification.
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
const apiSrc = readFileSync(resolve(root, "src/api/agentCompensation360SupabaseApi.js"), "utf8");
const boundsSrc = readFileSync(resolve(root, "src/api/hqReadBounds.js"), "utf8");

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

for (const column of ["Period", "Salary", "Commission", "Allowances", "Adjustments", "Net Pay", "Status"]) {
  assert(panelSrc.includes(column), `column.${column}`, `${column} payroll history column present`);
}

assert(/payrollHistory/.test(panelSrc), "ui.section", "payroll history section present");
assert(/payroll_run_lines/.test(apiSrc), "api.lines", "360 loader reads payroll run lines");
assert(/HQ_PAYROLL_LINE_READ_COLUMNS/.test(boundsSrc), "bounds.lines", "bounded payroll line columns declared");

const model = buildAgentCompensation360Model({
  agentId: "QA_AGENT_001",
  payrollLines: [
    {
      id: "line-1",
      payroll_run_id: "run-1",
      period_id: "period-1",
      salary_amount: 25000,
      commission_amount: 18.45,
      fuel_allowance: 3000,
      mobile_allowance: 500,
      net_payable: 28518.45,
      line_status: "previewed",
    },
  ],
  payrollRuns: [{ id: "run-1", run_number: 1, status: "previewed" }],
  payrollPeriods: [{ id: "period-1", period_ym: "2026-07" }],
});
assert(model.payrollHistory.length === 1, "model.rows", "payroll history rows built");
assert(model.payrollHistory[0].periodYm === "2026-07", "model.period", "period mapped from payroll period");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
