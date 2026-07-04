#!/usr/bin/env node
/**
 * Phase 4A Executive Compensation dashboard verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExecutiveCompensationModel } from "../src/compensation/executiveCompensationModel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");
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

const sampleModel = buildExecutiveCompensationModel({
  payrollPeriods: [{ id: "p1", period_ym: "2026-06", status: "submitted" }],
  payrollRuns: [{ id: "r1", period_id: "p1", run_number: 1, status: "submitted" }],
  payrollRunLines: [
    {
      id: "l1",
      payroll_run_id: "r1",
      period_id: "p1",
      agent_id: "A1",
      agent_name: "Agent One",
      salary_amount: 10000,
      commission_amount: 500,
      net_payable: 10500,
      line_status: "submitted",
      calculation_snapshot: { collection_efficiency_pct: 82, promotion_eligible: true },
    },
  ],
  commissionEntries: [],
  compensationPlans: [],
  planAssignments: [],
  auditEvents: [],
  payrollExports: [],
});

for (const key of [
  "currentPayrollLiability",
  "commissionPayable",
  "pendingPayrollPeriods",
  "lockedPayrollRuns",
  "exportedPayrollRuns",
  "paidEvidenceRuns",
  "collectionEfficiency",
  "promotionEligibleAgents",
  "averageCommission",
  "averagePayroll",
]) {
  assert(sampleModel.kpis[key] != null, `kpi.${key}`, `${key} computed`);
}

for (const chart of [
  "payrollTrend",
  "commissionTrend",
  "collectionTrend",
  "liabilityTrend",
  "topAgents",
  "promotionPipeline",
]) {
  assert(Array.isArray(sampleModel.charts[chart]), `chart.${chart}`, `${chart} chart present`);
}

assert(/KpiCardGrid/.test(pageSrc), "ui.kpi_grid", "dashboard renders KPI cards");
assert(/Overview/.test(pageSrc), "ui.overview_tab", "overview tab present");
assert(/Commission History/.test(pageSrc), "ui.commission_history_tab", "commission history tab present");
assert(/Audit/.test(pageSrc), "ui.audit_tab", "audit tab present");
assert(/Exports/.test(pageSrc), "ui.exports_tab", "exports tab present");
assert(/loadExecutiveCompensationCenterRead/.test(pageSrc), "ui.read_loader", "page uses read-only loader");
assert(/loadExecutiveCompensationCenterRead/.test(readApiSrc), "api.read_only", "read API exported");
assert(!/\.(insert|update|delete|upsert)\(/.test(readApiSrc), "api.no_writes", "read API has no mutations");
assert(/buildExecutiveCompensationModel/.test(modelSrc), "model.builder", "model builder present");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
