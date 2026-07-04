#!/usr/bin/env node
/**
 * Compensation/payroll no-finance-mutation verification.
 * Read-only/static source checks for Phase 3C domain workflow boundaries.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const payrollApiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");
const previewApiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");
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

const sourceTables = [
  "orders",
  "invoices",
  "payments",
  "invoice_payment_allocations",
  "ar_credit_control",
  "collections",
  "inventory",
  "order_shipments",
  "commission_entries",
];
for (const [label, src] of [
  ["payroll_api", payrollApiSrc],
  ["preview_api", previewApiSrc],
]) {
  for (const table of sourceTables) {
    assert(
      !new RegExp(`from\\("${table}"\\)\\s*\\.\\s*(insert|update|delete|upsert)`).test(src),
      `${label}.no_write.${table}`,
      `${label} does not write ${table}`
    );
  }
}
for (const table of sourceTables) {
  assert(
    !new RegExp(`ALTER TABLE public\\.${table}|CREATE TRIGGER[\\s\\S]*ON public\\.${table}`, "i").test(
      migrationSrc
    ),
    `migration.no_alter.${table}`,
    `Phase 3C migration does not alter ${table}`
  );
}
assert(/no_payment_row_created:\s*true/.test(payrollApiSrc), "api.no_payment_row", "paid evidence creates no payment row");
assert(/no_gl_posting_created:\s*true/.test(payrollApiSrc), "api.no_gl", "no GL posting evidence flag");
assert(/no_bank_disbursement_created:\s*true/.test(payrollApiSrc), "api.no_bank", "no bank disbursement evidence flag");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
