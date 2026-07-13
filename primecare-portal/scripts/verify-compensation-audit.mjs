#!/usr/bin/env node
/**
 * Compensation audit foundation verification.
 * Static/read-only: validates append-only audit and approval event infrastructure.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migrationPath = resolve(root, "supabase/migrations/20260706120000_compensation_payroll_foundation.sql");
const sql = readFileSync(migrationPath, "utf8");

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

function tableBlock(table) {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`, "i");
  return sql.match(re)?.[1] || "";
}

const audit = tableBlock("compensation_audit_events");
const approvals = tableBlock("compensation_approval_events");
const adjustments = tableBlock("compensation_adjustments");

for (const column of [
  "event_type text NOT NULL",
  "entity_type text NOT NULL",
  "entity_id text",
  "actor_user_id uuid",
  "actor_role text",
  "before_json jsonb",
  "after_json jsonb",
  "reason text",
  "created_at timestamptz NOT NULL DEFAULT now()",
]) {
  assert(audit.includes(column), `audit.column.${column.split(" ")[0]}`, column);
}

for (const action of ["submit", "approve", "reject", "request_changes", "lock", "export", "void"]) {
  assert(approvals.includes(`'${action}'`), `approval.action.${action}`, "approval action constrained");
}

for (const type of ["manual_adjustment", "penalty", "recovery"]) {
  assert(adjustments.includes(`'${type}'`), `adjustment.type.${type}`, "adjustment type constrained");
}

assert(
  /GRANT SELECT, INSERT ON public\.compensation_audit_events TO authenticated;/i.test(sql),
  "audit.grant_insert_only",
  "audit table has SELECT/INSERT grant only"
);
assert(
  /GRANT SELECT, INSERT ON public\.compensation_approval_events TO authenticated;/i.test(sql),
  "approval.grant_insert_only",
  "approval events have SELECT/INSERT grant only"
);
assert(
  !/CREATE POLICY compensation_audit_events_update/i.test(sql),
  "audit.no_update_policy",
  "no audit UPDATE policy"
);
assert(
  !/CREATE POLICY compensation_approval_events_update/i.test(sql),
  "approval.no_update_policy",
  "no approval UPDATE policy"
);
assert(
  /compensation_audit_events_insert[\s\S]*compensation_can_support_tenant/i.test(sql),
  "audit.insert_support",
  "support roles can write foundation audit events"
);
assert(
  /compensation_approval_events_insert[\s\S]*compensation_can_approve_tenant/i.test(sql),
  "approval.insert_executive",
  "approval events require Executive approval helper"
);
assert(
  /idx_compensation_audit_events_tenant_created/i.test(sql) &&
    /idx_compensation_approval_events_tenant_run/i.test(sql),
  "audit.indexes",
  "audit and approval indexes present"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}

console.log("\nOverall: GO\n");
