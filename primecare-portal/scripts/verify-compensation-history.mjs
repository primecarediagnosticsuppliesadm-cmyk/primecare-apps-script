#!/usr/bin/env node
/**
 * Phase 4A compensation history UI verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExecutiveCompensationModel } from "../src/compensation/executiveCompensationModel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const readApiSrc = readFileSync(resolve(root, "src/api/compensationReadSupabaseApi.js"), "utf8");

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

const model = buildExecutiveCompensationModel({
  payrollPeriods: [],
  payrollRuns: [{ id: "r1", period_id: "p1", run_number: 2, status: "locked", updated_at: "2026-06-01T00:00:00.000Z" }],
  payrollRunLines: [],
  commissionEntries: [
    {
      id: "c1",
      agent_id: "A1",
      agent_name: "Agent One",
      commission_amount: 100,
      status: "locked",
      created_at: "2026-06-02T00:00:00.000Z",
    },
  ],
  compensationPlans: [],
  planAssignments: [
    {
      id: "a1",
      agent_id: "A1",
      agent_name: "Agent One",
      plan_id: "plan1",
      assignment_status: "active",
      start_date: "2026-01-01",
    },
  ],
  auditEvents: [
    {
      id: "e1",
      event_type: "preview",
      entity_type: "payroll_run",
      entity_id: "r1",
      actor_role: "executive",
      created_at: "2026-06-03T00:00:00.000Z",
    },
  ],
  payrollExports: [
    {
      id: "x1",
      export_format: "csv",
      checksum: "abc",
      created_at: "2026-06-04T00:00:00.000Z",
    },
  ],
});

assert(model.commissionHistoryRows.length >= 1, "history.commission_rows", "commission history rows built");
assert(model.auditTimeline.length >= 1, "history.audit_rows", "audit timeline built");
assert(model.exportRows.length >= 1, "history.export_rows", "export rows built");
assert(/Commission History/.test(pageSrc), "ui.commission_history_tab", "commission history tab present");
assert(/auditTimeline/.test(pageSrc), "ui.audit_tab", "audit tab present");
assert(/exportRows/.test(pageSrc), "ui.exports_tab", "exports tab present");
assert(/compensation_audit_events/.test(readApiSrc), "api.audit_read", "audit events read from compensation tables");
assert(/payroll_exports/.test(readApiSrc), "api.export_read", "export metadata read for history");
assert(!/\.(insert|update|delete|upsert)\(/.test(pageSrc), "ui.no_writes", "history UI has no mutation calls");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
