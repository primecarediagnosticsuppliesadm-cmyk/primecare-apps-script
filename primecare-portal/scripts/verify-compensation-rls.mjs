#!/usr/bin/env node
/**
 * Compensation RLS foundation + Phase 3C.1 hardening verification.
 * Static/read-only: validates helper functions, RLS enablement, and policy roles.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const foundationPath = resolve(root, "supabase/migrations/20260706120000_compensation_payroll_foundation.sql");
const hardeningPath = resolve(root, "supabase/migrations/20260706131000_payroll_domain_rls_hardening.sql");
const foundationSql = readFileSync(foundationPath, "utf8");
const hardeningSql = readFileSync(hardeningPath, "utf8");
const sql = `${foundationSql}\n${hardeningSql}`;

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
  "compensation_payroll_hr_transition_allowed",
  "compensation_payroll_executive_transition_allowed",
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
}

for (const table of TABLES) {
  assert(
    new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i").test(foundationSql),
    `rls.${table}`,
    "RLS enabled"
  );
  assert(
    new RegExp(`CREATE POLICY ${table}_[a-z_]+\\s+ON public\\.${table}`, "i").test(foundationSql) ||
      new RegExp(`CREATE POLICY [a-z_]+\\s+ON public\\.${table}`, "i").test(hardeningSql),
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
  /lower\(COALESCE\(row_status, ''\)\) IN \('locked', 'exported', 'paid'\)/i.test(hardeningSql),
  "roles.agent_own_locked_exported_paid",
  "Agent read path limited to own locked/exported/paid line states"
);
assert(
  !/compensation_role\(\)\s*IN\s*\([^)]*distributor/i.test(sql),
  "roles.distributor_excluded",
  "Distributor roles are not granted compensation access"
);
assert(
  /payroll_exports_insert[\s\S]*compensation_can_approve_tenant/i.test(foundationSql) &&
    /compensation_approval_events_insert[\s\S]*compensation_can_approve_tenant/i.test(foundationSql),
  "roles.executive_approval_export",
  "Approval/export insert paths require Executive helper"
);
assert(
  /payroll_runs_update_hr[\s\S]*status IN \('draft', 'previewed'\)/i.test(hardeningSql) &&
    /payroll_runs_update_executive[\s\S]*compensation_can_approve_tenant/i.test(hardeningSql),
  "roles.workflow_update_split",
  "HR and Executive workflow update policies are split"
);
assert(
  /enforce_payroll_workflow_rbac/i.test(hardeningSql),
  "roles.workflow_trigger",
  "workflow RBAC trigger enforces transition authority"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}

console.log("\nOverall: GO\n");
