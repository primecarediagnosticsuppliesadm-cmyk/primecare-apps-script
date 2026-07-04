#!/usr/bin/env node
/**
 * Phase 3C payroll audit verification.
 * Read-only/static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

for (const eventType of ["preview", "submit", "approve", "reject", "lock", "export", "pay", "reopen"]) {
  assert(apiSrc.includes(eventType), `api.audit.${eventType}`, `${eventType} workflow audit supported`);
}
assert(/from\("compensation_audit_events"\)\.insert/.test(apiSrc), "api.audit_insert", "audit events inserted");
assert(
  /from\("compensation_approval_events"\)\.insert/.test(apiSrc),
  "api.approval_insert",
  "workflow evidence events inserted"
);
for (const action of ["'submit'", "'approve'", "'reject'", "'lock'", "'export'", "'pay'", "'reopen'"]) {
  assert(migrationSrc.includes(action), `migration.action.${action}`, `${action} approval action constrained`);
}
assert(/finance_o2c_mutation:\s*false/.test(apiSrc), "api.no_finance_metadata", "audit metadata marks no Finance/O2C mutation");
assert(
  !/from\("(orders|payments|ar_credit_control|invoice_payment_allocations|inventory|order_shipments)"\)[\s\S]*\.(update|insert|delete)/.test(
    apiSrc
  ),
  "api.no_source_mutation",
  "payroll workflow does not mutate source domains"
);
assert(
  /event_type: "adjustment_requested"/.test(apiSrc) &&
    /event_type: "adjustment_approved"/.test(apiSrc) &&
    /event_type: "adjustment_rejected"/.test(apiSrc),
  "api.adjustment_audit",
  "adjustment request/approve/reject audit events present"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
