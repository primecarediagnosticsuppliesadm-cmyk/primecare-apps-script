#!/usr/bin/env node
/**
 * Phase 3B payroll preview verification.
 * Read-only/unit + static source checks for draft-only persistence.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCompensationPreview } from "../src/compensation/compensationCalculationEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const previewApiSrc = readFileSync(resolve(root, "src/api/compensationSupabaseApi.js"), "utf8");
const payrollApiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");
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

const preview = calculateCompensationPreview({
  period: {
    id: "period-preview",
    tenant_id: "tenant-1",
    period_start: "2026-06-01",
    period_end: "2026-06-30",
  },
  payments: [
    {
      payment_id: "PAY-1",
      tenant_id: "tenant-1",
      lab_id: "LAB-1",
      payment_date: "2026-06-10",
      amount_received: 1000,
      agent_id: "A1",
    },
  ],
  planAssignments: [
    {
      id: "assign-a1",
      tenant_id: "tenant-1",
      plan_id: "plan-a",
      agent_id: "A1",
      start_date: "2026-06-01",
      assignment_status: "active",
    },
    {
      id: "assign-a2",
      tenant_id: "tenant-1",
      plan_id: "plan-a",
      agent_id: "A2",
      start_date: "2026-06-01",
      assignment_status: "active",
    },
  ],
  compensationPlans: [{ id: "plan-a", version: "v1", commission_rate_bps: 300 }],
});

assert(preview.payrollRun.status === "draft", "preview.run_draft", "payroll run draft");
assert(preview.payrollRunLines.every((line) => line.line_status === "draft"), "preview.lines_draft", "lines draft");
assert(
  preview.commissionEntries.every((entry) => entry.status === "draft"),
  "preview.commissions_draft",
  "commission entries draft"
);
assert(preview.totals.records_calculated === 2, "preview.records", "records calculated for assigned agents");
assert(preview.payrollRun.metadata.no_approval === true, "preview.no_approval", "no approval metadata");
assert(preview.payrollRun.metadata.no_export === true, "preview.no_export", "no export metadata");

assert(/from\("payroll_runs"\)[\s\S]*insert/.test(previewApiSrc), "api.insert_run", "draft run insert present");
assert(/from\("payroll_run_lines"\)[\s\S]*insert/.test(previewApiSrc), "api.insert_lines", "draft line insert present");
assert(
  /from\("compensation_commission_entries"\)[\s\S]*insert/.test(previewApiSrc),
  "api.insert_commissions",
  "draft commission insert present"
);
assert(
  /preview_generation_start/.test(previewApiSrc) && /preview_generated/.test(previewApiSrc),
  "api.preview_audit_events",
  "preview generation audit events present in compensation preview API"
);
assert(
  /writeWorkflowEvents/.test(payrollApiSrc) && /compensation_audit_events/.test(payrollApiSrc),
  "api.workflow_audit_events",
  "payroll workflow audit events present in payroll domain API"
);
assert(!/from\("compensation_approval_events"\)/.test(previewApiSrc), "api.no_approval_events", "no approval event writes");
assert(!/from\("payroll_exports"\)/.test(previewApiSrc), "api.no_exports", "no export writes");
assert(!/status:\s*"(approved|locked|exported)"/.test(previewApiSrc), "api.no_terminal_status", "no terminal statuses written");
assert(/ExecutiveCompensationCenterPage/.test(pageSrc), "ui.compensation_page", "Executive Compensation UI page present");
assert(/loadExecutiveCompensationCenterRead/.test(pageSrc), "ui.read_loader", "Executive Compensation uses read loader");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
