#!/usr/bin/env node
/**
 * Phase 3C payroll lifecycle verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_ACTIONS,
  PAYROLL_STATUSES,
  buildPayrollTransition,
  nextPayrollStatus,
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

const actor = { role: "executive", userId: "00000000-0000-0000-0000-000000000001" };
let status = PAYROLL_STATUSES.DRAFT;
for (const [action, expected] of [
  [PAYROLL_ACTIONS.PREVIEW, PAYROLL_STATUSES.PREVIEWED],
  [PAYROLL_ACTIONS.SUBMIT, PAYROLL_STATUSES.SUBMITTED],
  [PAYROLL_ACTIONS.APPROVE, PAYROLL_STATUSES.APPROVED],
  [PAYROLL_ACTIONS.LOCK, PAYROLL_STATUSES.LOCKED],
  [PAYROLL_ACTIONS.EXPORT, PAYROLL_STATUSES.EXPORTED],
  [PAYROLL_ACTIONS.PAY, PAYROLL_STATUSES.PAID],
]) {
  status = nextPayrollStatus({ currentStatus: status, action });
  assert(status === expected, `lifecycle.${action}`, `${action} -> ${expected}`);
}

assertThrows(
  () => nextPayrollStatus({ currentStatus: PAYROLL_STATUSES.DRAFT, action: PAYROLL_ACTIONS.APPROVE }),
  "lifecycle.no_skip",
  "draft cannot skip to approved"
);

assert(
  buildPayrollTransition({
    payrollRun: { status: PAYROLL_STATUSES.SUBMITTED },
    action: PAYROLL_ACTIONS.REJECT,
    actor,
    reason: "incorrect preview",
  }).toStatus === PAYROLL_STATUSES.DRAFT,
  "lifecycle.reject",
  "reject returns submitted run to draft"
);
assert(
  buildPayrollTransition({
    payrollRun: { status: PAYROLL_STATUSES.EXPORTED },
    action: PAYROLL_ACTIONS.REOPEN,
    actor,
    reason: "reopen for correction",
  }).createsNewRunVersion === true,
  "lifecycle.reopen_version",
  "reopen creates a new draft run version"
);

for (const required of ["draft", "previewed", "submitted", "approved", "locked", "exported", "paid"]) {
  assert(migrationSrc.includes(`'${required}'`), `migration.status.${required}`, `${required} status constrained`);
}
for (const fn of [
  "previewPayrollRunWrite",
  "submitPayrollRunWrite",
  "approvePayrollRunWrite",
  "rejectPayrollRunWrite",
  "lockPayrollRunWrite",
  "generatePayrollExportWrite",
  "recordPayrollPaidWrite",
  "reopenPayrollRunWrite",
]) {
  assert(apiSrc.includes(`export async function ${fn}`), `api.${fn}`, `${fn} exported`);
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
