#!/usr/bin/env node
/**
 * Compensation foundation schema verification.
 * Static/read-only: validates the Phase 3A migration without touching QA data.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migrationPath = resolve(root, "supabase/migrations/20260706120000_compensation_payroll_foundation.sql");

const REQUIRED_TABLES = [
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

const FORBIDDEN_MUTATIONS = [
  /ALTER\s+TABLE\s+public\.orders\b/i,
  /ALTER\s+TABLE\s+public\.invoices\b/i,
  /ALTER\s+TABLE\s+public\.payments\b(?!.*role)/i,
  /ALTER\s+TABLE\s+public\.ar_credit_control\b/i,
  /ALTER\s+TABLE\s+public\.invoice_payment_allocations\b/i,
  /ALTER\s+TABLE\s+public\.inventory\b/i,
  /ALTER\s+TABLE\s+public\.inventory_ledger\b/i,
  /ALTER\s+TABLE\s+public\.order_shipments\b/i,
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(calculate|compute|build)_/i,
  /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.commission_entries\b/i,
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

if (!existsSync(migrationPath)) {
  fail("migration.exists", `Missing ${migrationPath}`);
} else {
  pass("migration.exists", "compensation foundation migration present");
}

const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

for (const table of REQUIRED_TABLES) {
  assert(
    new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, "i").test(sql),
    `table.${table}`,
    "table declared"
  );
  assert(
    new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i").test(sql),
    `rls.${table}`,
    "RLS enabled"
  );
}

assert(/profiles_role_check[\s\S]*'hr'/i.test(sql), "role.profiles_hr", "profiles role check includes hr");
assert(/users_role_check[\s\S]*'HR'::text/i.test(sql), "role.users_hr", "legacy users role check includes HR");
assert(
  /compensation_commission_entries[\s\S]*attributable_cash_collected numeric/i.test(sql),
  "commission.cash_field",
  "cash-only commission field exists"
);
assert(
  /compensation_attribution_snapshots[\s\S]*source_hash text/i.test(sql),
  "attribution.source_hash",
  "attribution source hash supported"
);
assert(
  /payroll_periods_status_check[\s\S]*draft[\s\S]*previewed[\s\S]*submitted[\s\S]*approved[\s\S]*locked[\s\S]*exported/i.test(sql),
  "period.lifecycle",
  "payroll lifecycle statuses constrained"
);
assert(
  !/revenue_attributed|revenue_commission|fulfilled_revenue|projected_revenue/i.test(sql),
  "commission.no_revenue_fields",
  "payroll schema has no revenue commission fields"
);

for (const pattern of FORBIDDEN_MUTATIONS) {
  assert(!pattern.test(sql), `forbidden.${pattern.source}`, "not present");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}

console.log("\nOverall: GO\n");
