#!/usr/bin/env node
/**
 * Phase 7.2 — canonical executive reporting context verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExecutiveCompensationModel } from "../src/compensation/executiveCompensationModel.js";
import { resolveReportingContext } from "../src/compensation/reportingContext.js";

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

const fixture = {
  payrollPeriods: [
    { id: "p1", period_ym: "2026-06", period_start: "2026-06-01", period_end: "2026-06-30", status: "locked" },
    { id: "p2", period_ym: "2026-07", period_start: "2026-07-01", period_end: "2026-07-31", status: "draft" },
  ],
  payrollRuns: [
    { id: "r1", period_id: "p2", run_number: 3, status: "draft", generated_at: "2026-07-07T16:32:00Z", generated_by: "exec-1" },
    { id: "r2", period_id: "p2", run_number: 5, status: "draft", generated_at: "2026-07-08T10:00:00Z", generated_by: "exec-1" },
    { id: "r3", period_id: "p1", run_number: 1, status: "locked", generated_at: "2026-06-30T12:00:00Z" },
  ],
  payrollRunLines: [
    { id: "l-old", payroll_run_id: "r1", period_id: "p2", profile_user_id: "u1", agent_id: "A1", net_payable: 10000, commission_amount: 100 },
    { id: "l-new", payroll_run_id: "r2", period_id: "p2", profile_user_id: "u1", agent_id: "A1", net_payable: 25000, commission_amount: 500 },
    { id: "l-probe", payroll_run_id: "r2", period_id: "p2", profile_user_id: "u-probe", agent_id: "PROBE", agent_name: "Probe Agent", net_payable: 99999, commission_amount: 999 },
  ],
  profiles: [
    { user_id: "u1", role: "agent", agent_id: "A1", display_name: "Real Agent" },
    { user_id: "u-probe", role: "agent", agent_id: "PROBE", display_name: "Probe Agent", email: "probe@invalid.example.com" },
  ],
  commissionEntries: [],
  compensationPlans: [],
  planAssignments: [],
  payments: [],
  arRows: [],
  labs: [],
  auditEvents: [],
  payrollExports: [],
};

const latestDefault = resolveReportingContext(fixture);
assert(latestDefault.periodId === "p2", "context.latest_period", "defaults to latest period");
assert(latestDefault.payrollRunId === "r2", "context.latest_run", "defaults to highest run number");
assert(latestDefault.source === "latest_default", "context.latest_source", "latest default source");

const explicit = resolveReportingContext({
  ...fixture,
  periodId: "p2",
  payrollRunId: "r1",
});
assert(explicit.payrollRunId === "r1", "context.explicit_run", "honors explicit run selection");
assert(explicit.source === "selection", "context.explicit_source", "selection source when both provided");

const periodOnly = resolveReportingContext({ ...fixture, periodId: "p2" });
assert(periodOnly.payrollRunId === "r2", "context.period_default_run", "period-only picks highest run");

const model = buildExecutiveCompensationModel({
  ...fixture,
  reportingSelection: { periodId: "p2", payrollRunId: "r2" },
});
assert(model.kpis.currentPayrollLiability === 25000, "kpi.single_run_liability", "overview liability uses selected run only");
assert(model.contextPreviewTotal === 25000, "kpi.preview_total_match", "context preview total matches selected run");
assert(model.intelligence.forecast.baselinePayroll === 25000, "forecast.baseline_persisted", "forecast baseline uses persisted run lines");
assert(!model.intelligence.rankings.agentRows.some((row) => /probe/i.test(row.agentName)), "exclusion.probe", "probe users excluded from rankings");
assert(/ReportingContextCard/.test(pageSrc), "ui.reporting_card", "reporting context card present");
assert(/reportingSelection/.test(pageSrc), "ui.reporting_selection", "page passes reporting selection to model");
assert(/resolveReportingContext/.test(modelSrc), "model.context_resolution", "façade resolves reporting context");
assert(/buildRatioMetrics/.test(modelSrc), "model.ratio_helper", "façade orchestrates ratio helper");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
