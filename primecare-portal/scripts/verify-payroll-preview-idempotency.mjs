#!/usr/bin/env node
/**
 * Phase 4B payroll preview idempotency verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");

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

assert(/findDraftPayrollRun/.test(apiSrc), "idempotent.lookup", "draft run lookup before persist");
assert(/clearDraftPreviewArtifacts/.test(apiSrc), "idempotent.clear", "clears lines and draft commission entries");
assert(
  /existingDraft[\s\S]*clearDraftPreviewArtifacts[\s\S]*payrollRunId = existingDraft\.id/.test(apiSrc),
  "idempotent.reuse_run",
  "regeneration reuses existing draft run and replaces line artifacts only"
);
assert(/payroll_run_lines"\)\s*\.delete\(\)/.test(apiSrc), "idempotent.delete_lines", "deletes old lines before reinsert");
assert(
  /compensation_commission_entries"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("status", "draft"\)/.test(apiSrc),
  "idempotent.delete_commissions",
  "deletes draft commission entries before reinsert"
);
assert(/regenerated/.test(apiSrc), "idempotent.audit_flag", "regeneration flagged in audit metadata");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
