#!/usr/bin/env node
/**
 * Phase 3C payroll immutability verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_STATUSES,
  isPayrollImmutableStatus,
} from "../src/payroll/payrollDomainWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");
const completionSrc = readFileSync(
  resolve(root, "supabase/migrations/20260706130000_payroll_domain_completion.sql"),
  "utf8"
);
const hardeningSrc = readFileSync(
  resolve(root, "supabase/migrations/20260706131000_payroll_domain_rls_hardening.sql"),
  "utf8"
);
const migrationSrc = `${completionSrc}\n${hardeningSrc}`;

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

for (const status of [PAYROLL_STATUSES.LOCKED, PAYROLL_STATUSES.EXPORTED, PAYROLL_STATUSES.PAID]) {
  assert(isPayrollImmutableStatus(status), `domain.immutable.${status}`, `${status} is immutable`);
  assert(migrationSrc.includes(`'${status}'`), `migration.status.${status}`, `${status} in SQL guard scope`);
}
assert(!isPayrollImmutableStatus(PAYROLL_STATUSES.APPROVED), "domain.approved_mutable", "approved remains mutable until lock");

for (const guard of [
  "prevent_locked_payroll_period_mutation",
  "prevent_locked_payroll_run_mutation",
  "prevent_locked_payroll_line_mutation",
  "prevent_locked_commission_entry_mutation",
  "prevent_locked_adjustment_mutation",
]) {
  assert(migrationSrc.includes(guard), `migration.${guard}`, `${guard} present`);
}

for (const helper of [
  "payroll_run_header_fields_unchanged",
  "payroll_period_header_fields_unchanged",
  "payroll_line_financial_fields_unchanged",
  "commission_entry_financial_fields_unchanged",
]) {
  assert(hardeningSrc.includes(helper), `hardening.${helper}`, `${helper} present`);
}

assert(
  /payroll_run_export_transition_header_mutation_blocked/.test(hardeningSrc),
  "hardening.export_header_guard",
  "export transition blocks header/financial mutation"
);
assert(
  /payroll_run_paid_transition_header_mutation_blocked/.test(hardeningSrc),
  "hardening.paid_header_guard",
  "paid transition blocks header/financial mutation"
);
assert(
  /payroll_line_financial_update_executive_only/.test(hardeningSrc),
  "hardening.line_financial_exec_only",
  "line financial mutation requires executive"
);
assert(
  /commission_entry_financial_mutation_blocked/.test(hardeningSrc),
  "hardening.commission_financial_blocked",
  "commission financial fields blocked after lock"
);
assert(
  !/OLD\.status = NEW\.status[\s\S]*RETURN NEW/.test(migrationSrc),
  "migration.no_same_status_edit",
  "locked runs do not allow same-status data edits"
);
assert(
  /reopened_from_payroll_run_id/.test(apiSrc) && /line_status:\s*PAYROLL_STATUSES\.DRAFT/.test(apiSrc),
  "api.reopen_new_draft",
  "reopen creates a new draft run version"
);
assert(
  /no_payment_row_created:\s*true/.test(apiSrc),
  "api.paid_evidence_only",
  "paid evidence does not create payment rows"
);
assert(
  !/from\("(orders|payments|ar_credit_control|invoice_payment_allocations|inventory|order_shipments)"\)\s*\.(update|insert|delete|upsert)/.test(
    apiSrc
  ),
  "api.no_o2c_mutation",
  "workflow API does not mutate Finance/O2C tables"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
