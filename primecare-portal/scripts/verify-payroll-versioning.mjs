#!/usr/bin/env node
/**
 * Phase 3C payroll workflow versioning verification.
 * Read-only/unit + static source checks.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_DOMAIN_RULE_VERSION,
  PAYROLL_EXPORT_FORMATS,
  PAYROLL_STATUSES,
  buildPayrollExportModel,
} from "../src/payroll/payrollDomainWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");
const workflowSrc = readFileSync(resolve(root, "src/payroll/payrollDomainWorkflow.js"), "utf8");
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

assert(
  PAYROLL_DOMAIN_RULE_VERSION === "PC_PAYROLL_DOMAIN_2026_PHASE3C",
  "domain.rule_version",
  "Phase 3C workflow rule version constant"
);
const model = buildPayrollExportModel({
  payrollRun: { id: "RUN-V", period_id: "PERIOD-V", status: PAYROLL_STATUSES.LOCKED },
  payrollRunLines: [{ agent_id: "A1", net_payable: 100, line_status: "locked" }],
  format: PAYROLL_EXPORT_FORMATS.ACCOUNTING_READY,
  generatedAt: "2026-07-04T15:00:00.000Z",
});
assert(model.ruleVersion === PAYROLL_DOMAIN_RULE_VERSION, "export.rule_version", "export model stores rule version");
assert(model.generatedAt === "2026-07-04T15:00:00.000Z", "export.generated_at", "export model stores generated_at");

for (const token of [
  "PAYROLL_DOMAIN_RULE_VERSION",
  "workflow_rule_version",
  "rule_version",
  "reopened_from_payroll_run_id",
  "reopened_from_payroll_run_line_id",
]) {
  assert(apiSrc.includes(token) || workflowSrc.includes(token), `source.${token}`, `${token} present`);
}
assert(/nextRunNumber/.test(apiSrc), "api.next_run_number", "reopen uses next run number");
assert(/run_number:\s*nextNumber/.test(apiSrc), "api.reopen_run_number", "new draft version gets next run number");
assert(/COMMENT ON FUNCTION public\.prevent_locked_payroll_run_mutation/.test(migrationSrc), "migration.comments", "immutability/versioning comments present");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
