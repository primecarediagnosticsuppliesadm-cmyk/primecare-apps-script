#!/usr/bin/env node
/**
 * Phase 4B payroll calculation rules verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  YEAR1_BASELINE_PLAN,
  calculateCompensationPreview,
  calculatePromotionEligibility,
} from "../src/compensation/compensationCalculationEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const engineSrc = readFileSync(resolve(root, "src/compensation/compensationCalculationEngine.js"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");

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

assert(YEAR1_BASELINE_PLAN.baseSalary === 20_000, "rules.salary", "Month 1-3 salary ₹20,000");
assert(YEAR1_BASELINE_PLAN.fuelAllowance === 5_000, "rules.fuel", "fuel ₹5,000");
assert(YEAR1_BASELINE_PLAN.mobileAllowance === 500, "rules.mobile", "mobile ₹500");
assert(YEAR1_BASELINE_PLAN.commissionRateBps === 300, "rules.commission", "commission 3%");
assert(YEAR1_BASELINE_PLAN.promotionSalary === 25_000, "rules.promoted_salary", "promoted salary ₹25,000");
assert(YEAR1_BASELINE_PLAN.promotionCommissionRateBps === 350, "rules.promoted_commission", "promoted commission 3.5%");
assert(YEAR1_BASELINE_PLAN.promotionCollectionThreshold === 500_000, "rules.promotion_threshold", "promotion threshold ₹5,00,000");
assert(YEAR1_BASELINE_PLAN.promotionMinEfficiencyPct === 80, "rules.promotion_efficiency", "promotion efficiency 80%");
assert(YEAR1_BASELINE_PLAN.promotionMaxOverdueDays === 90, "rules.promotion_overdue", "promotion overdue <=90 days");

const preview = calculateCompensationPreview({
  period: { id: "p1", tenant_id: "t1", period_start: "2026-06-01", period_end: "2026-06-30" },
  payments: [{ payment_id: "P1", tenant_id: "t1", lab_id: "L1", payment_date: "2026-06-05", amount_received: 1000, agent_id: "A1" }],
  cumulativePayments: [{ payment_id: "P1", tenant_id: "t1", lab_id: "L1", payment_date: "2026-06-05", amount_received: 1000, agent_id: "A1" }],
  planAssignments: [{ id: "as1", tenant_id: "t1", plan_id: "plan1", agent_id: "A1", start_date: "2026-04-01", assignment_status: "active" }],
  compensationPlans: [{ id: "plan1", version: "v1", commission_rate_bps: 300, base_salary: 20000, fuel_allowance: 5000, mobile_allowance: 500 }],
});
assert(preview.payrollRunLines[0]?.commission_amount === 30, "rules.cash_commission", "commission = cash collected × rate");
assert(preview.payrollRunLines[0]?.salary_amount === 20_000, "rules.line_salary", "line salary uses baseline plan");

const assignedNoCash = calculateCompensationPreview({
  period: { id: "p2", tenant_id: "t1", period_start: "2026-07-01", period_end: "2026-07-31" },
  payments: [],
  planAssignments: [
    { id: "as1", tenant_id: "t1", plan_id: "plan1", agent_id: "A1", agent_name: "Agent One", start_date: "2026-01-01", assignment_status: "active" },
    { id: "as2", tenant_id: "t1", plan_id: "plan1", agent_id: "A2", agent_name: "Agent Two", start_date: "2026-01-01", assignment_status: "active" },
  ],
  compensationPlans: [{ id: "plan1", version: "v1", commission_rate_bps: 300, base_salary: 20000, fuel_allowance: 5000, mobile_allowance: 500 }],
});
assert(assignedNoCash.payrollRunLines.length === 2, "rules.assigned_zero_cash_lines", "assigned agents without collections still receive fixed payroll lines");
assert(
  assignedNoCash.payrollRunLines.every((line) => line.commission_amount === 0 && line.salary_amount === 20_000),
  "rules.zero_commission_fixed_salary",
  "zero-cash assigned agents get salary with zero commission"
);

const promoted = calculatePromotionEligibility({
  cumulativeCollectedCash: 500_000,
  collectionEfficiencyPct: 85,
  maxOverdueDays: 10,
  monthsInPlan: 3,
  plan: YEAR1_BASELINE_PLAN,
});
assert(promoted.eligible === true, "rules.promotion_pass", "promotion eligibility passes when thresholds met");

assert(!/from\("(orders|invoices)"\)/.test(apiSrc), "rules.no_order_invoice_reads", "preview API does not read orders/invoices");
assert(/amount_received/.test(engineSrc), "rules.cash_only", "engine uses cash collected");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
