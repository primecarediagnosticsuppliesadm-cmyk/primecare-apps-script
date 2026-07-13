#!/usr/bin/env node
/**
 * Phase 3C payroll adjustment verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_ACTIONS,
  PAYROLL_ADJUSTMENT_TYPES,
  buildPayrollAdjustment,
  canPerformPayrollAction,
  signedAdjustmentAmount,
} from "../src/payroll/payrollDomainWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");
const migrationSrc = readFileSync(
  resolve(root, "supabase/migrations/20260706130000_payroll_domain_completion.sql"),
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
function assertThrows(fn, id, detail) {
  try {
    fn();
    fail(id, detail);
  } catch {
    pass(id, detail);
  }
}

for (const type of Object.values(PAYROLL_ADJUSTMENT_TYPES)) {
  assert(migrationSrc.includes(`'${type}'`), `migration.adjustment.${type}`, `${type} adjustment constrained`);
}
assert(signedAdjustmentAmount({ adjustmentType: "positive", amount: 100 }) === 100, "adjustment.positive", "positive increases net");
assert(signedAdjustmentAmount({ adjustmentType: "negative", amount: 100 }) === -100, "adjustment.negative", "negative decreases net");
assert(signedAdjustmentAmount({ adjustmentType: "recovery", amount: 100 }) === -100, "adjustment.recovery", "recovery decreases net");
assert(signedAdjustmentAmount({ adjustmentType: "advance", amount: 100 }) === 100, "adjustment.advance", "advance increases current payroll evidence");
assert(signedAdjustmentAmount({ adjustmentType: "correction", amount: -25 }) === -25, "adjustment.correction", "correction preserves sign");

const adjustment = buildPayrollAdjustment({
  actor: { role: "hr", userId: "hr-1" },
  adjustment: {
    tenant_id: "tenant-1",
    period_id: "period-1",
    payroll_run_id: "run-1",
    payroll_run_line_id: "line-1",
    agent_id: "A1",
    adjustment_type: "positive",
    component: "manual_adjustment",
    amount: 250,
    reason: "field allowance correction",
  },
});
assert(adjustment.status === "draft", "adjustment.build", "HR can create draft adjustment");
assert(canPerformPayrollAction("hr", PAYROLL_ACTIONS.ADJUSTMENT_CREATE), "rbac.hr_create", "HR can create adjustment");
assert(!canPerformPayrollAction("hr", PAYROLL_ACTIONS.ADJUSTMENT_APPROVE), "rbac.hr_no_approve", "HR cannot approve adjustment");
assert(canPerformPayrollAction("executive", PAYROLL_ACTIONS.ADJUSTMENT_APPROVE), "rbac.exec_approve", "Executive can approve adjustment");
assertThrows(
  () => buildPayrollAdjustment({ actor: { role: "admin" }, adjustment: { adjustment_type: "positive", amount: 1, reason: "x" } }),
  "adjustment.admin_blocked",
  "admin cannot create adjustment"
);

for (const fn of [
  "createPayrollAdjustmentWrite",
  "submitPayrollAdjustmentWrite",
  "approvePayrollAdjustmentWrite",
  "rejectPayrollAdjustmentWrite",
]) {
  assert(apiSrc.includes(`export async function ${fn}`), `api.${fn}`, `${fn} exported`);
}
assert(/payroll_adjustment_blocked_after_lock/.test(apiSrc), "api.lock_block", "adjustments blocked after lock");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
