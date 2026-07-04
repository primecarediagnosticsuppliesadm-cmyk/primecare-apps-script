#!/usr/bin/env node
/**
 * Payroll period lifecycle foundation verification.
 * Static/read-only: validates lifecycle states without invoking calculations.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migrationPath = resolve(root, "supabase/migrations/20260706120000_compensation_payroll_foundation.sql");
const sql = readFileSync(migrationPath, "utf8");

const STATUSES = ["draft", "previewed", "submitted", "approved", "locked", "exported"];
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
function blockFor(checkName) {
  const re = new RegExp(`CONSTRAINT ${checkName} CHECK \\(([\\s\\S]*?)\\)`, "i");
  return sql.match(re)?.[1] || "";
}

const periodStatus = blockFor("payroll_periods_status_check");
const runStatus = blockFor("payroll_runs_status_check");
const lineStatus = blockFor("payroll_run_lines_status_check");
const commissionStatus = blockFor("compensation_commission_entries_status_check");

for (const status of STATUSES) {
  assert(periodStatus.includes(status), `period.${status}`, "period status supported");
  assert(runStatus.includes(status), `run.${status}`, "run status supported");
  assert(lineStatus.includes(status), `line.${status}`, "line status supported");
  assert(commissionStatus.includes(status), `commission.${status}`, "commission ledger status supported");
}

assert(/period_ym text NOT NULL/i.test(sql), "period.period_ym", "period_ym declared");
assert(/period_ym ~ '\^\\d\{4\}-\\d\{2\}\$'/i.test(sql), "period.period_format", "YYYY-MM check present");
assert(/payroll_runs_tenant_period_run_key UNIQUE/i.test(sql), "run.unique_version", "run number version key present");
assert(
  !/calculate_payroll|generate_payroll_preview|approve_payroll_run|lock_payroll_run|export_payroll/i.test(sql),
  "no_engine_functions",
  "no payroll engine workflow functions present"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}

console.log("\nOverall: GO\n");
