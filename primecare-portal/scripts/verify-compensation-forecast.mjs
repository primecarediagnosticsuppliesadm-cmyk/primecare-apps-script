#!/usr/bin/env node
/**
 * Phase 7.2 compensation forecast verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExecutiveCompensationModel } from "../src/compensation/executiveCompensationModel.js";
import {
  buildNewHireForecast,
  FORECAST_SCENARIO_PRESETS,
} from "../src/compensation/compensationIntelligenceEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/ExecutiveCompensationIntelligencePanel.jsx"),
  "utf8"
);
const forecastSrc = readFileSync(resolve(root, "src/compensation/analytics/forecastMetrics.js"), "utf8");

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

const model = buildExecutiveCompensationModel({
  payrollPeriods: [{ id: "p1", period_ym: "2026-07", period_start: "2026-07-01", period_end: "2026-07-31" }],
  payrollRuns: [{ id: "r1", period_id: "p1", run_number: 1, status: "draft" }],
  payrollRunLines: [
    {
      id: "l1",
      payroll_run_id: "r1",
      period_id: "p1",
      profile_user_id: "u1",
      agent_id: "A1",
      net_payable: 42000,
      commission_amount: 1200,
    },
  ],
  profiles: [{ user_id: "u1", role: "agent", agent_id: "A1" }],
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
  planAssignments: [{ id: "as1", profile_user_id: "u1", agent_id: "A1", plan_id: "plan1", assignment_status: "active", start_date: "2026-01-01" }],
  payments: [{ agent_id: "A1", amount_received: 10000, payment_date: "2026-07-10" }],
  arRows: [],
  reportingSelection: { periodId: "p1", payrollRunId: "r1" },
});

const forecast = model.intelligence.forecast;
assert(FORECAST_SCENARIO_PRESETS.length >= 7, "forecast.presets", "forecast scenario presets declared");
assert(forecast.previewOnly === true, "forecast.preview_only", "forecast is preview only");
assert(forecast.baselineFromPersistedRun === true, "forecast.baseline_persisted_flag", "baseline flagged as persisted run");
assert(forecast.baselinePayroll === 42000, "forecast.baseline_payroll", "baseline payroll equals persisted run total");
assert(forecast.scenarios.length === FORECAST_SCENARIO_PRESETS.length, "forecast.scenarios", "scenarios generated");
const collectionsScenario = forecast.scenarios.find((row) => row.id === "collections_10");
assert(collectionsScenario?.incrementalCost !== undefined, "forecast.incremental_cost", "incremental cost computed");
assert(
  forecast.recalculatedPreviewTotal == null || forecast.recalculatedPreviewTotal !== forecast.baselinePayroll,
  "forecast.baseline_not_preview_recalc",
  "baseline is not required to equal recalculated preview when payments differ"
);

const newHire = buildNewHireForecast({
  hireCount: 2,
  plan: { plan_code: "BASE", version: "v1", base_salary: 20000, fuel_allowance: 5000, mobile_allowance: 500 },
  averageCommissionPerAgent: 1000,
});
assert(newHire.previewOnly === true, "new_hire.preview_only", "new hire forecast is preview only");
assert(/Forward Payroll Forecast/.test(panelSrc), "ui.forward_forecast", "forward forecast UI present");
assert(/baselineFromPersistedRun/.test(forecastSrc), "helper.persisted_baseline", "forecast helper uses persisted baseline");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
