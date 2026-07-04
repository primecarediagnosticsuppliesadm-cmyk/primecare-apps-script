#!/usr/bin/env node
/**
 * Compensation RLS foundation verification.
 * Static/read-only: validates helper functions, RLS enablement, and policy roles.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migrationPath = resolve(root, "supabase/migrations/20260706120000_compensation_payroll_foundation.sql");
const sql = readFileSync(migrationPath, "utf8");

const TABLES = [
  "compensation_plans",
  "compensation_plan_assignments",
  "payroll_periods",
  "payroll_runs",
  "payroll_run_lines",
  "compensation_commission_entries",
  "compensation_adjustments",
  "compensation_audit_events",
  "compensation_approval_events",
  "payroll_exports",
  "compensation_attribution_snapshots",
];

const HELPERS = [
  "compensation_role",
  "compensation_agent_matches",
  "compensation_can_select_tenant",
  "compensation_can_support_tenant",
  "compensation_can_approve_tenant",
  "compensation_agent_line_visible",
];

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

for (const helper of HELPERS) {
  assert(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${helper}\\b`, "i").test(sql),
    `helper.${helper}`,
    "helper function declared"
  );
  assert(
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${helper}`, "i").test(sql),
    `grant.${helper}`,
    "helper execute grant declared"
  );
}

for (const table of TABLES) {
  assert(
    new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i").test(sql),
    `rls.${table}`,
    "RLS enabled"
  );
  assert(
    new RegExp(`CREATE POLICY ${table}_[a-z_]+\\s+ON public\\.${table}`, "i").test(sql),
    `policy.${table}`,
    "at least one policy declared"
  );
}

assert(
  /compensation_role\(\) = 'executive'/i.test(sql) &&
    /compensation_role\(\) = 'hr'/i.test(sql) &&
    /compensation_role\(\) IN \('hr', 'admin'\)/i.test(sql),
  "roles.executive_hr_admin",
  "Executive/HR/Admin helper semantics present"
);
assert(
  /public\.compensation_agent_line_visible\(agent_id, profile_user_id, line_status\)/i.test(sql) &&
    /lower\(COALESCE\(row_status, ''\)\) IN \('locked', 'exported'\)/i.test(sql),
  "roles.agent_own_locked",
  "Agent read path limited to own locked/exported line states"
);
assert(
  !/compensation_role\(\)\s*IN\s*\([^)]*distributor/i.test(sql),
  "roles.distributor_excluded",
  "Distributor roles are not granted compensation access"
);
assert(
  /payroll_exports_insert[\s\S]*compensation_can_approve_tenant/i.test(sql) &&
    /compensation_approval_events_insert[\s\S]*compensation_can_approve_tenant/i.test(sql),
  "roles.executive_approval_export",
  "Approval/export insert paths require Executive helper"
);
assert(
  /compensation_can_support_tenant[\s\S]*compensation_role\(\) = 'hr'/i.test(sql),
  "roles.hr_support_only",
  "HR support helper present without approval helper access"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}

console.log("\nOverall: GO\n");
