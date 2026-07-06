#!/usr/bin/env node
/**
 * Phase 7 compensation forecast verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCompensationIntelligence,
  buildNewHireForecast,
  FORECAST_SCENARIO_PRESETS,
} from "../src/compensation/compensationIntelligenceEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/ExecutiveCompensationIntelligencePanel.jsx"),
  "utf8"
);
const readApiSrc = readFileSync(resolve(root, "src/api/compensationReadSupabaseApi.js"), "utf8");

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

const intelligence = buildCompensationIntelligence({
  payrollPeriods: [{ id: "p1", period_ym: "2026-07", period_start: "2026-07-01", period_end: "2026-07-31" }],
  payrollRuns: [{ id: "r1", period_id: "p1", status: "draft" }],
  payrollRunLines: [],
  compensationPlans: [
    {
      id: "plan1",
      plan_code: "BASE",
      version: "v1",
      status: "active",
      base_salary: 20000,
      fuel_allowance: 5000,
      mobile_allowance: 500,
      commission_rate_bps: 300,
    },
  ],
  planAssignments: [{ id: "as1", agent_id: "A1", plan_id: "plan1", assignment_status: "active", start_date: "2026-01-01" }],
  payments: [{ agent_id: "A1", amount_received: 10000, payment_date: "2026-07-10" }],
  arRows: [],
  currentPayrollLiability: 0,
  commissionPayable: 0,
});

assert(FORECAST_SCENARIO_PRESETS.length >= 7, "forecast.presets", "forecast scenario presets declared");
assert(intelligence.forecast.previewOnly === true, "forecast.preview_only", "forecast is preview only");
assert(intelligence.forecast.scenarios.length === FORECAST_SCENARIO_PRESETS.length, "forecast.scenarios", "scenarios generated");
const collectionsScenario = intelligence.forecast.scenarios.find((row) => row.id === "collections_10");
assert(collectionsScenario?.incrementalCost >= 0, "forecast.incremental_cost", "incremental cost computed");

const newHire = buildNewHireForecast({
  hireCount: 2,
  plan: { plan_code: "BASE", version: "v1", base_salary: 20000, fuel_allowance: 5000, mobile_allowance: 500 },
  averageCommissionPerAgent: 1000,
});
assert(newHire.previewOnly === true, "new_hire.preview_only", "new hire forecast is preview only");
assert(newHire.projectedMonthlyIncrease > 0, "new_hire.projected_increase", "new hire projected increase computed");
assert(/Forward Payroll Forecast/.test(panelSrc), "ui.forward_forecast", "forward forecast UI present");
assert(/New Hire Forecast/.test(panelSrc), "ui.new_hire_forecast", "new hire forecast UI present");
assert(!/\.insert\(/.test(readFileSync(resolve(root, "src/compensation/compensationIntelligenceEngine.js"), "utf8")), "engine.no_writes", "intelligence engine has no writes");
assert(!/from\("(payments|orders|invoices)"\)\s*\.(insert|update|delete)/.test(readApiSrc), "read.no_finance_writes", "read API does not mutate finance tables");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
