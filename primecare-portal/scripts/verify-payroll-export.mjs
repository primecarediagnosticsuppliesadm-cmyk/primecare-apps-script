#!/usr/bin/env node
/**
 * Phase 3C payroll export model verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_EXPORT_FORMATS,
  PAYROLL_STATUSES,
  buildPayrollExportModel,
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

const run = { id: "RUN-1", period_id: "PERIOD-1", period_ym: "2026-06", status: PAYROLL_STATUSES.LOCKED };
const lines = [
  {
    payroll_run_id: "RUN-1",
    agent_id: "A1",
    agent_name: "Agent One",
    salary_amount: 20000,
    fuel_allowance: 5000,
    mobile_allowance: 500,
    commission_amount: 300,
    gross_pay: 25800,
    deductions_total: 100,
    net_payable: 25700,
    line_status: "locked",
  },
];

const csv = buildPayrollExportModel({ payrollRun: run, payrollRunLines: lines, format: PAYROLL_EXPORT_FORMATS.CSV });
assert(csv.contentType === "text/csv" && csv.body.includes("agent_id"), "export.csv", "CSV export body generated");
const excel = buildPayrollExportModel({
  payrollRun: run,
  payrollRunLines: lines,
  format: PAYROLL_EXPORT_FORMATS.EXCEL,
});
assert(excel.workbook?.sheets?.[0]?.rows?.length === 1, "export.excel", "Excel-ready workbook generated");
const accounting = buildPayrollExportModel({
  payrollRun: run,
  payrollRunLines: lines,
  format: PAYROLL_EXPORT_FORMATS.ACCOUNTING_READY,
});
assert(
  accounting.accountingEntries?.[0]?.no_gl_posting_created === true,
  "export.accounting_ready",
  "accounting-ready structure avoids GL posting"
);
assertThrows(
  () =>
    buildPayrollExportModel({
      payrollRun: { ...run, status: PAYROLL_STATUSES.APPROVED },
      payrollRunLines: lines,
      format: PAYROLL_EXPORT_FORMATS.CSV,
    }),
  "export.requires_lock",
  "export requires locked/exported/paid run"
);

for (const format of ["'csv'", "'excel'", "'accounting_ready'"]) {
  assert(migrationSrc.includes(format), `migration.format.${format}`, `${format} export format constrained`);
}
assert(
  /from\("payroll_exports"\)[\s\S]*\.insert/.test(apiSrc),
  "api.export_insert",
  "payroll export metadata inserted"
);
assert(/no_bank_file_created:\s*true/.test(apiSrc), "api.no_bank", "no bank file generated");
assert(/no_gl_posting_created:\s*true/.test(apiSrc), "api.no_gl", "no GL posting generated");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
