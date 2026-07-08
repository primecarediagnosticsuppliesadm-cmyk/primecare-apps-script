#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rolesSrc = readFileSync(resolve(root, "src/compensation/enterpriseCompensationRoles.js"), "utf8");
const migrationSrc = readFileSync(
  resolve(root, "supabase/migrations/20260707140000_enterprise_compensation_phase_7_1.sql"),
  "utf8"
);

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

for (const role of ["agent", "admin", "executive", "hr", "warehouse", "delivery", "operations", "support", "future"]) {
  assert(rolesSrc.includes(`"${role}"`), `role.${role}`, `${role} scope declared`);
}
assert(/profile_user_id IS NOT NULL/.test(migrationSrc), "schema.profile_primary", "assignments require profile_user_id");
assert(/agent_id DROP NOT NULL/.test(migrationSrc), "schema.agent_optional", "agent_id nullable on assignments");
assert(/compensation_plans_role_scope_check/.test(migrationSrc), "schema.plan_role_check", "plan role_scope check");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO\n");
