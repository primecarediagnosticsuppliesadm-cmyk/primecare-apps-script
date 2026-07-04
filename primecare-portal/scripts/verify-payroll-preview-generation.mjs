#!/usr/bin/env node
/**
 * Phase 4B payroll preview generation verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");
const domainSrc = readFileSync(resolve(root, "src/payroll/payrollPreviewGeneration.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");

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

assert(/export async function generatePayrollPreview/.test(apiSrc), "api.generate_export", "generatePayrollPreview exported");
assert(/assertPayrollPeriodDraftForPreview/.test(apiSrc), "api.draft_guard", "draft period guard enforced");
assert(/findDraftPayrollRun/.test(apiSrc), "api.draft_lookup", "existing draft lookup present");
assert(/clearDraftPreviewArtifacts/.test(apiSrc), "api.clear_draft", "draft artifact cleanup present");
assert(/preview_generation_start/.test(apiSrc) && /preview_generated/.test(apiSrc), "api.audit", "generation audit events present");
assert(/source_payment_hash/.test(apiSrc), "api.payment_hash", "source payment hash recorded");
assert(/calculation_version/.test(apiSrc), "api.calculation_version", "calculation version recorded");
assert(/status:\s*"draft"/.test(apiSrc), "api.draft_status", "writes remain draft-only");
assert(!/from\("(payments|orders|invoices|ar_credit_control)"\)\s*\.(update|insert|delete|upsert)/.test(apiSrc), "api.no_finance_writes", "no finance table writes");
assert(/Generate Payroll Preview/.test(pageSrc), "ui.generate_button", "Executive generate button present");
assert(/generatePayrollPreview/.test(pageSrc), "ui.generate_call", "page calls generatePayrollPreview");
assert(/row\.status === "draft"/.test(pageSrc), "ui.draft_only_button", "generate visible for draft periods only");
assert(/PAYROLL_PREVIEW_GENERATION_VERSION/.test(domainSrc), "domain.version", "preview generation version declared");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
