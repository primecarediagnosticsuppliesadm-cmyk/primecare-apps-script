#!/usr/bin/env node
/**
 * Phase 4B payroll period generation verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPayrollPeriodDraftForPreview } from "../src/payroll/payrollPreviewGeneration.js";

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
function assertThrows(fn, id, detail) {
  try {
    fn();
    fail(id, detail);
  } catch {
    pass(id, detail);
  }
}

assert(assertPayrollPeriodDraftForPreview({ status: "draft" }), "period.draft_ok", "draft period allowed");
assert(
  assertPayrollPeriodDraftForPreview({ status: "paid" }, { activeDraftRun: { status: "draft" } }),
  "period.reopen_draft_run_ok",
  "paid period with active draft run allowed for preview regeneration"
);
assertThrows(
  () => assertPayrollPeriodDraftForPreview({ status: "submitted" }),
  "period.submitted_blocked",
  "non-draft period without draft run blocked"
);
assertThrows(
  () => assertPayrollPeriodDraftForPreview({ status: "paid" }),
  "period.paid_without_draft_blocked",
  "paid period without draft run blocked"
);
assert(/readPayrollPeriod/.test(apiSrc), "period.resolve", "payroll period resolved before generation");
assert(/period_ym/.test(apiSrc) && /period_id/.test(apiSrc), "period.keys", "period id/ym supported");
assert(/payroll_periods/.test(apiSrc), "period.table", "uses payroll_periods table");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
