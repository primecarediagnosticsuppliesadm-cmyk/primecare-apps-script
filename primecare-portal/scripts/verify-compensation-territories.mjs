#!/usr/bin/env node
/**
 * Phase 7 compensation territory analytics verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompensationIntelligence } from "../src/compensation/compensationIntelligenceEngine.js";

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
  payrollRunLines: [
    { id: "l1", payroll_run_id: "r1", period_id: "p1", agent_id: "A1", agent_name: "North Agent", net_payable: 25000, commission_amount: 500, calculation_snapshot: { collection_efficiency_pct: 85 } },
    { id: "l2", payroll_run_id: "r1", period_id: "p1", agent_id: "A2", agent_name: "South Agent", net_payable: 20000, commission_amount: 400, calculation_snapshot: { collection_efficiency_pct: 70 } },
  ],
  planAssignments: [
    { agent_id: "A1", assignment_status: "active" },
    { agent_id: "A2", assignment_status: "active" },
  ],
  payments: [
    { agent_id: "A1", amount_received: 40000, payment_date: "2026-07-04" },
    { agent_id: "A2", amount_received: 20000, payment_date: "2026-07-05" },
  ],
  arRows: [
    { lab_id: "L1", total_delivered: 80000 },
    { lab_id: "L2", total_delivered: 30000 },
  ],
  labs: [
    { lab_id: "L1", assigned_agent_id: "A1", area: "North" },
    { lab_id: "L2", assigned_agent_id: "A2", area: "South" },
  ],
  currentPayrollLiability: 45000,
  commissionPayable: 900,
});

assert(intelligence.territoryRows.length === 2, "territory.rows", "territory rows built");
assert(intelligence.territoryRows.some((row) => row.territory === "North"), "territory.north", "north territory present");
assert(intelligence.rankings.agentRows.every((row) => row.territory !== "—" || row.agentId), "rankings.territory", "agent rows include territory");
assert(/Territory Compensation Performance/.test(panelSrc), "ui.territory_panel", "territory panel present");
assert(/v_labs_credit/.test(readApiSrc), "read.labs_credit", "bounded labs read for territory analytics");
assert(/ar_credit_control/.test(readApiSrc), "read.ar", "bounded AR read for revenue context");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
