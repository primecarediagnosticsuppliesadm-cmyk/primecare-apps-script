#!/usr/bin/env node
/**
 * Phase 3B compensation calculation verification.
 * Read-only/unit: validates pure preview calculations without database writes.
 */
import {
  calculateCompensationPreview,
  calculateAgentCompensation,
  calculateCollectionEfficiency,
} from "../src/compensation/compensationCalculationEngine.js";

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

const period = {
  id: "period-2026-06",
  tenant_id: "tenant-1",
  period_ym: "2026-06",
  period_start: "2026-06-01",
  period_end: "2026-06-30",
};
const plan = {
  id: "plan-year1",
  plan_code: "AGENT_YEAR1_BASELINE",
  version: "v3",
  base_salary: 20000,
  fuel_allowance: 5000,
  mobile_allowance: 500,
  commission_rate_bps: 300,
  promotion_salary: 25000,
  promotion_commission_rate_bps: 350,
  promotion_collection_threshold: 500000,
  promotion_min_efficiency_pct: 80,
  promotion_max_overdue_days: 90,
  rules_json: { ruleVersion: "RULE-V3" },
};
const assignments = [
  {
    id: "assign-a1",
    tenant_id: "tenant-1",
    plan_id: "plan-year1",
    agent_id: "A1",
    agent_name: "Agent One",
    start_date: "2026-04-01",
    assignment_status: "active",
  },
  {
    id: "assign-a2",
    tenant_id: "tenant-1",
    plan_id: "plan-year1",
    agent_id: "A2",
    agent_name: "Agent Two",
    start_date: "2026-06-01",
    assignment_status: "active",
  },
];
const payments = [
  {
    payment_id: "PAY-1",
    tenant_id: "tenant-1",
    lab_id: "LAB-1",
    amount_received: 100000,
    payment_date: "2026-06-10",
    agent_id: "A1",
    order_total: 999999,
    invoice_total: 999999,
  },
  {
    payment_id: "PAY-2",
    tenant_id: "tenant-1",
    lab_id: "LAB-2",
    amount_received: 50000,
    payment_date: "2026-06-15",
    agent_id: "",
  },
];
const cumulativePayments = [
  ...payments,
  {
    payment_id: "PAY-HIST",
    tenant_id: "tenant-1",
    lab_id: "LAB-9",
    amount_received: 450000,
    payment_date: "2026-05-10",
    agent_id: "A1",
  },
];
const attributionSnapshots = [
  {
    id: "snap-pay-2",
    tenant_id: "tenant-1",
    period_id: "period-2026-06",
    payment_id: "PAY-2",
    payment_date: "2026-06-15",
    lab_id: "LAB-2",
    agent_id: "A2",
    agent_name: "Agent Two",
    attribution_method: "lab_ownership_snapshot",
    source_hash: "snapshot-hash",
  },
];
const arRows = [
  {
    tenant_id: "tenant-1",
    lab_id: "LAB-1",
    total_delivered: 550000,
    days_overdue: 0,
  },
  {
    tenant_id: "tenant-1",
    lab_id: "LAB-2",
    total_delivered: 50000,
    days_overdue: 0,
  },
];

const preview = calculateCompensationPreview({
  period,
  payments,
  cumulativePayments,
  attributionSnapshots,
  planAssignments: assignments,
  compensationPlans: [plan],
  arRows,
  calculatedAt: "2026-07-04T10:00:00.000Z",
});

assert(preview.status === "draft", "preview.status", "preview remains draft");
assert(preview.commissionEntries.length === 2, "commission.count", "two agent commission entries calculated");
assert(preview.payrollRunLines.length === 2, "payroll.lines", "two payroll lines calculated");
assert(preview.payrollRun.status === "draft", "run.status", "payroll run is draft");

const a1Commission = preview.commissionEntries.find((entry) => entry.agent_id === "A1");
const a1Line = preview.payrollRunLines.find((line) => line.agent_id === "A1");
assert(a1Commission?.attributable_cash_collected === 100000, "a1.period_cash", "period cash only");
assert(a1Commission?.commission_amount === 3000, "a1.commission", "baseline commission 3%");
assert(a1Line?.salary_amount === 25000, "a1.promotion_salary", "promoted salary applied");
assert(a1Line?.commission_amount === 3500, "a1.promoted_commission", "promoted commission 3.5%");
assert(a1Line?.net_payable === 34000, "a1.net_preview", "net preview includes salary, allowances, commission");

const a2Line = preview.payrollRunLines.find((line) => line.agent_id === "A2");
assert(a2Line?.salary_amount === 20000, "a2.baseline_salary", "baseline salary applied");
assert(a2Line?.commission_amount === 1500, "a2.baseline_commission", "baseline commission 3%");

const directLine = calculateAgentCompensation({
  period,
  plan,
  planAssignment: assignments[1],
  commissionEntry: {
    tenant_id: "tenant-1",
    period_id: "period-2026-06",
    agent_id: "A2",
    agent_name: "Agent Two",
    attributable_cash_collected: 1000,
    metadata: { source_lab_ids: ["LAB-2"] },
  },
  arRows,
  calculatedAt: "2026-07-04T10:00:00.000Z",
});
assert(directLine.line_status === "draft", "agent.line_status", "agent compensation is draft");
assert(directLine.quarterly_bonus === 0, "agent.bonus_placeholder", "bonus placeholder is zero");
assert(directLine.penalties_total === 0, "agent.penalty_placeholder", "penalty placeholder is zero");

const efficiency = calculateCollectionEfficiency({ collectedCash: 80, collectibleAmount: 100 });
assert(efficiency.collectionEfficiencyPct === 80, "efficiency", "collection efficiency calculated");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
