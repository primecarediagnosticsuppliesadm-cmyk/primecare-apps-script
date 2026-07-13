#!/usr/bin/env node
/**
 * Phase 7.2 compensation rankings verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExecutiveCompensationModel } from "../src/compensation/executiveCompensationModel.js";
import { sortRankingRows, RANKING_SORT_KEYS } from "../src/compensation/analytics/rankingMetrics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/ExecutiveCompensationIntelligencePanel.jsx"),
  "utf8"
);

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
      agent_name: "High",
      net_payable: 30000,
      commission_amount: 1000,
      calculation_snapshot: { collection_efficiency_pct: 90 },
    },
    {
      id: "l2",
      payroll_run_id: "r1",
      period_id: "p1",
      profile_user_id: "u2",
      agent_id: "A2",
      agent_name: "Low",
      net_payable: 10000,
      commission_amount: 100,
      calculation_snapshot: { collection_efficiency_pct: 40 },
    },
    {
      id: "l3",
      payroll_run_id: "r1",
      period_id: "p1",
      profile_user_id: "u-probe",
      agent_id: "PROBE",
      agent_name: "Probe Agent",
      net_payable: 50000,
      commission_amount: 5000,
      calculation_snapshot: { collection_efficiency_pct: 99 },
    },
  ],
  profiles: [
    { user_id: "u1", role: "agent", agent_id: "A1", display_name: "High" },
    { user_id: "u2", role: "agent", agent_id: "A2", display_name: "Low" },
    { user_id: "u-probe", role: "agent", agent_id: "PROBE", display_name: "Probe Agent", email: "probe@invalid.example.com" },
  ],
  planAssignments: [
    { profile_user_id: "u1", agent_id: "A1", assignment_status: "active" },
    { profile_user_id: "u2", agent_id: "A2", assignment_status: "active" },
  ],
  payments: [
    { agent_id: "A1", amount_received: 50000, payment_date: "2026-07-05", lab_id: "L1" },
    { agent_id: "A2", amount_received: 5000, payment_date: "2026-07-06", lab_id: "L2" },
  ],
  arRows: [
    { lab_id: "L1", total_delivered: 100000 },
    { lab_id: "L2", total_delivered: 10000 },
  ],
  labs: [
    { lab_id: "L1", assigned_agent_id: "A1", area: "North" },
    { lab_id: "L2", assigned_agent_id: "A2", area: "South" },
  ],
  reportingSelection: { periodId: "p1", payrollRunId: "r1" },
});

const rankings = model.intelligence.rankings;
assert(rankings.agentRows.length === 2, "rankings.rows", "probe excluded; two real employees ranked");
assert(rankings.topPerformers[0]?.profileUserId === "u1", "rankings.top", "top performer identified by profile");
assert(rankings.bottomPerformers[0]?.profileUserId === "u2", "rankings.bottom", "bottom performer identified");
assert(
  sortRankingRows(rankings.agentRows, "collections", "desc")[0].profileUserId === "u1",
  "rankings.sort_collections",
  "collections sort works"
);
assert(RANKING_SORT_KEYS.length === 5, "rankings.sort_keys", "all sort keys declared");
assert(/Unified Agent Rankings/.test(panelSrc), "ui.unified_rankings", "unified rankings UI present");
assert(/profileUserId/.test(panelSrc), "ui.profile_primary_key", "rankings keyed by profile user id");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
