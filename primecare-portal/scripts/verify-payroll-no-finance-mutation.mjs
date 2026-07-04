#!/usr/bin/env node
/**
 * Phase 6A payroll workflow no-finance-mutation verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const payrollApiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");
const previewApiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");

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
];
for (const [label, src] of [
  ["payroll_api", payrollApiSrc],
  ["preview_api", previewApiSrc],
  ["page", pageSrc],
]) {
  for (const table of sourceTables) {
    assert(
      !new RegExp(`from\\("${table}"\\)\\s*\\.\\s*(insert|update|delete|upsert)`).test(src),
      `${label}.no_write.${table}`,
      `${label} does not write ${table}`
    );
  }
}

assert(/finance_o2c_mutation:\s*false/.test(payrollApiSrc), "api.finance_flag", "workflow writes declare no finance mutation");
assert(!/from\("(payments|invoices|orders)"\)/.test(pageSrc), "page.no_o2c_reads_for_mutation", "page does not mutate O2C tables directly");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
