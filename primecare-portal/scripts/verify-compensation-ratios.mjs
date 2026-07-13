#!/usr/bin/env node
/**
 * Phase 7.2 compensation ratio KPI verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExecutiveCompensationModel } from "../src/compensation/executiveCompensationModel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/ExecutiveCompensationIntelligencePanel.jsx"),
  "utf8"
);
const ratioSrc = readFileSync(resolve(root, "src/compensation/analytics/ratioMetrics.js"), "utf8");

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
  payrollPeriods: [
    {
      id: "p1",
      period_ym: "2026-07",
      status: "draft",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
    },
  ],
  payrollRuns: [{ id: "r1", period_id: "p1", run_number: 1, status: "draft" }],
  payrollRunLines: [
    {
      id: "l1",
      payroll_run_id: "r1",
      period_id: "p1",
      profile_user_id: "u1",
      agent_id: "A1",
      agent_name: "Agent One",
      salary_amount: 20000,
      commission_amount: 500,
      net_payable: 25500,
      line_status: "draft",
      calculation_snapshot: { collection_efficiency_pct: 80 },
    },
  ],
  profiles: [{ user_id: "u1", role: "agent", agent_id: "A1", display_name: "Agent One" }],
  commissionEntries: [],
  compensationPlans: [{ id: "plan1", plan_code: "BASE", version: "v1", status: "active", base_salary: 20000 }],
  planAssignments: [{ id: "as1", profile_user_id: "u1", agent_id: "A1", plan_id: "plan1", assignment_status: "active" }],
  payments: [
    { payment_id: "P1", agent_id: "A1", lab_id: "L1", amount_received: 100000, payment_date: "2026-07-10", tenant_id: "t1" },
  ],
  arRows: [{ lab_id: "L1", total_delivered: 200000, tenant_id: "t1" }],
  labs: [{ lab_id: "L1", assigned_agent_id: "A1", area: "North", tenant_id: "t1" }],
  auditEvents: [],
  payrollExports: [],
  reportingSelection: { periodId: "p1", payrollRunId: "r1" },
});

const ratios = model.intelligence?.ratios;
assert(ratios?.payrollPctRevenueLabel?.includes("%"), "ratios.payroll_pct_revenue", "payroll % revenue computed");
assert(ratios?.payrollPctCollectionsLabel?.includes("%"), "ratios.payroll_pct_collections", "payroll % collections computed");
assert(ratios?.totalCollections === 100000, "ratios.cash_collected_period", "cash collected uses period payments");
assert(ratios?.totalRevenue === 200000, "ratios.revenue_generated_period", "revenue uses period-active labs only");
assert(ratios?.totalCollections !== ratios?.totalRevenue, "ratios.distinct_denominators", "cash collected and revenue differ");
assert(ratios?.revenuePerAgent > 0, "ratios.revenue_per_agent", "revenue per agent computed");
assert(ratios?.collectionsPerAgent > 0, "ratios.collections_per_agent", "collections per agent computed");
assert(/Payroll % Revenue/.test(panelSrc), "ui.payroll_pct_revenue", "ratio KPI rendered");
assert(/Payroll % Collections/.test(panelSrc), "ui.payroll_pct_collections", "ratio KPI rendered");
assert(/buildRatioMetrics/.test(ratioSrc), "helper.ratio_metrics", "ratio helper module present");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
