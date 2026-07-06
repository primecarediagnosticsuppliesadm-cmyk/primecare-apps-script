#!/usr/bin/env node
/**
 * Phase 7 compensation rankings verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCompensationIntelligence,
  sortRankingRows,
  RANKING_SORT_KEYS,
} from "../src/compensation/compensationIntelligenceEngine.js";

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

const intelligence = buildCompensationIntelligence({
  payrollPeriods: [{ id: "p1", period_ym: "2026-07", period_start: "2026-07-01", period_end: "2026-07-31" }],
  payrollRuns: [{ id: "r1", period_id: "p1", status: "draft" }],
  payrollRunLines: [
    { id: "l1", payroll_run_id: "r1", period_id: "p1", agent_id: "A1", agent_name: "High", net_payable: 30000, commission_amount: 1000, calculation_snapshot: { collection_efficiency_pct: 90 } },
    { id: "l2", payroll_run_id: "r1", period_id: "p1", agent_id: "A2", agent_name: "Low", net_payable: 10000, commission_amount: 100, calculation_snapshot: { collection_efficiency_pct: 40 } },
  ],
  planAssignments: [
    { agent_id: "A1", assignment_status: "active" },
    { agent_id: "A2", assignment_status: "active" },
  ],
  payments: [
    { agent_id: "A1", amount_received: 50000, payment_date: "2026-07-05" },
    { agent_id: "A2", amount_received: 5000, payment_date: "2026-07-06" },
  ],
  arRows: [
    { lab_id: "L1", total_delivered: 100000 },
    { lab_id: "L2", total_delivered: 10000 },
  ],
  labs: [
    { lab_id: "L1", assigned_agent_id: "A1", area: "North" },
    { lab_id: "L2", assigned_agent_id: "A2", area: "South" },
  ],
  currentPayrollLiability: 40000,
  commissionPayable: 1100,
});

assert(intelligence.rankings.agentRows.length === 2, "rankings.rows", "agent ranking rows built");
assert(intelligence.rankings.topPerformers[0]?.agentId === "A1", "rankings.top", "top performer identified");
assert(intelligence.rankings.bottomPerformers[0]?.agentId === "A2", "rankings.bottom", "bottom performer identified");
assert(
  sortRankingRows(intelligence.rankings.agentRows, "collections", "desc")[0].agentId === "A1",
  "rankings.sort_collections",
  "collections sort works"
);
assert(RANKING_SORT_KEYS.length === 5, "rankings.sort_keys", "all sort keys declared");
assert(/Unified Agent Rankings/.test(panelSrc), "ui.unified_rankings", "unified rankings UI present");
assert(/Bottom performers/.test(panelSrc), "ui.bottom_performers", "bottom performers toggle present");
assert(!/Top Performers/.test(readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8")), "ui.no_duplicate_top_card", "legacy top performers card removed");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
