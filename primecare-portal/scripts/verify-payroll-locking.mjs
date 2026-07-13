#!/usr/bin/env node
/**
 * Phase 3C payroll locking verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_ACTIONS,
  PAYROLL_STATUSES,
  buildPayrollTransition,
  canPerformPayrollAction,
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

const executiveTransition = buildPayrollTransition({
  payrollRun: { status: PAYROLL_STATUSES.APPROVED },
  action: PAYROLL_ACTIONS.LOCK,
  actor: { role: "executive", userId: "exec-1" },
  reason: "final approval complete",
});
assert(executiveTransition.toStatus === PAYROLL_STATUSES.LOCKED, "lock.executive", "executive locks approved run");
assert(canPerformPayrollAction("hr", PAYROLL_ACTIONS.LOCK) === false, "lock.hr_blocked", "HR cannot lock");
assert(canPerformPayrollAction("admin", PAYROLL_ACTIONS.LOCK) === false, "lock.admin_blocked", "admin cannot lock");
assert(canPerformPayrollAction("agent", PAYROLL_ACTIONS.LOCK) === false, "lock.agent_blocked", "agent cannot lock");
assertThrows(
  () =>
    buildPayrollTransition({
      payrollRun: { status: PAYROLL_STATUSES.SUBMITTED },
      action: PAYROLL_ACTIONS.LOCK,
      actor: { role: "executive", userId: "exec-1" },
      reason: "too early",
    }),
  "lock.requires_approved",
  "lock requires approved status"
);

assert(
  /prevent_locked_payroll_run_mutation/.test(migrationSrc),
  "migration.run_guard",
  "run lock guard present"
);
assert(
  /prevent_locked_payroll_line_mutation/.test(migrationSrc),
  "migration.line_guard",
  "line lock guard present"
);
assert(
  /updateDetailStatusesBeforeRunLock/.test(apiSrc) && /PAYROLL_ACTIONS\.LOCK/.test(apiSrc),
  "api.detail_status_before_lock",
  "details are status-updated before run lock"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
