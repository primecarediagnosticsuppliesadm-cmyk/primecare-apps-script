#!/usr/bin/env node
/**
 * verify-agent-visit-evidence-rls.mjs
 *
 * Purpose: VE-1 RLS contract — identity + lab visibility; Lab/HR/anon denied.
 * Module owner: Agent Visit Evidence
 *
 * Usage:
 *   node scripts/verify-agent-visit-evidence-rls.mjs
 *   node scripts/verify-agent-visit-evidence-rls.mjs --remote
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_PATH = resolve(
  root,
  "supabase/migrations/20260907140000_agent_visit_evidence_ve1.sql"
);
const ACCESS = resolve(root, "src/utils/accessFilters.js");
const PERMS = resolve(root, "src/config/rolePermissionMatrix.js");

let failures = 0;
function pass(id, d) {
  console.log(`PASS  ${id}: ${d}`);
}
function fail(id, d) {
  console.error(`FAIL  ${id}: ${d}`);
  failures += 1;
}
function skip(id, d) {
  console.log(`SKIP  ${id}: ${d}`);
}
function assert(c, id, d) {
  if (c) pass(id, d);
  else fail(id, d);
}

const sql = existsSync(SQL_PATH) ? readFileSync(SQL_PATH, "utf8") : "";
assert(sql.length > 0, "sql.exists", "VE-1 SQL present");

assert(/can_write_agent_work/.test(sql), "helper.can_write", "reuses can_write_agent_work");
assert(
  /lab_record_is_visible_to_current_user/.test(sql),
  "helper.lab_visible",
  "reuses lab_record_is_visible_to_current_user"
);
assert(
  !/CREATE OR REPLACE FUNCTION public\.lab_record_is_visible_to_current_user/.test(sql),
  "helper.no_replace_visibility",
  "does not replace lab visibility helper"
);
assert(
  !/CREATE OR REPLACE FUNCTION public\.can_write_agent_work/.test(sql),
  "helper.no_replace_agent_work",
  "does not replace can_write_agent_work"
);
assert(
  !/CREATE OR REPLACE FUNCTION public\.is_admin_or_executive/.test(sql),
  "helper.no_broaden_admin",
  "does not broaden is_admin_or_executive"
);

assert(
  /agent_visit_row_writable_by_current_agent/.test(sql),
  "compose.writable",
  "write helper composes agent work AND lab visibility"
);
assert(
  /current_user_role\(\) = 'agent'/.test(sql),
  "role.agent_write",
  "writes require agent role"
);
assert(/is_admin_or_executive\(\)/.test(sql), "role.hq_select", "HQ SELECT via is_admin_or_executive");

assert(/visit_write_agent_only/.test(sql), "stamp.reject_non_agent", "non-agent writers rejected at stamp");
assert(/NEW\.agent_id := nullif\(btrim\(v_profile\.agent_id\)/.test(sql), "stamp.agent_id", "stamps agent_id from profile");
assert(/NEW\.tenant_id := v_profile\.tenant_id/.test(sql), "stamp.tenant", "stamps tenant_id from profile");

assert(/POLICY "agent_visits_select_by_role"/.test(sql), "policy.visit_select", "visit SELECT policy");
assert(/POLICY "agent_visits_insert_by_role"/.test(sql), "policy.visit_insert", "visit INSERT policy");
assert(/POLICY "agent_visits_update_by_role"/.test(sql), "policy.visit_update", "visit UPDATE policy");
assert(
  !/POLICY "agent_visits_delete_by_role"[\s\S]*CREATE POLICY "agent_visits_delete/.test(sql),
  "policy.no_visit_delete",
  "no visit DELETE policy created"
);
assert(
  /-- No DELETE policy \(V1\)\./.test(sql),
  "policy.no_delete_comment",
  "DELETE explicitly omitted for V1"
);

assert(
  /POLICY "agent_visit_discovery_lines_insert_by_role"/.test(sql),
  "policy.line_insert",
  "line INSERT uses parent visit writability"
);
assert(/visit_line_parent_not_writable/.test(sql), "line.parent_gate", "cannot attach lines to non-writable parent");

assert(/REVOKE ALL ON TABLE public\.agent_visits FROM anon/.test(sql), "grant.revoke_anon_visits", "anon revoked visits");
assert(
  /REVOKE ALL ON TABLE public\.agent_visit_discovery_lines FROM anon/.test(sql),
  "grant.revoke_anon_lines",
  "anon revoked lines"
);
assert(
  /GRANT SELECT, INSERT, UPDATE ON TABLE public\.agent_visits TO authenticated/.test(sql),
  "grant.visits_auth",
  "authenticated visit SELECT/INSERT/UPDATE"
);
assert(
  /GRANT SELECT, INSERT, UPDATE ON TABLE public\.agent_visit_discovery_lines TO authenticated/.test(sql),
  "grant.lines_auth",
  "authenticated line SELECT/INSERT/UPDATE"
);
assert(!/GRANT DELETE ON TABLE public\.agent_visits/.test(sql), "grant.no_visit_delete", "no visit DELETE grant");
assert(
  !/GRANT DELETE ON TABLE public\.agent_visit_discovery_lines/.test(sql),
  "grant.no_line_delete",
  "no line DELETE grant"
);

const access = existsSync(ACCESS) ? readFileSync(ACCESS, "utf8") : "";
assert(/export function filterLabsForUser/.test(access), "ux.filter_untouched_export", "filterLabsForUser still exists");
assert(
  !sql.includes("filterLabsForUser"),
  "ux.filter_not_in_sql",
  "migration does not change operational lab filter"
);

const perms = existsSync(PERMS) ? readFileSync(PERMS, "utf8") : "";
assert(/visits: \[ROLES\.AGENT/.test(perms), "perm.visits_agent", "visits permission still agent");
assert(!/visits: \[[^\]]*ROLES\.LAB/.test(perms), "perm.no_lab_visits_key", "lab not granted visits page key");
assert(!/visits: \[[^\]]*ROLES\.HR/.test(perms), "perm.no_hr_visits_key", "HR not granted visits page key");

if (!process.argv.includes("--remote")) {
  skip(
    "live.rls",
    "pass --remote after linking/applying on QA zipuzmfkwwucbchlphcj — never Production alxhrnotnvwpblsiadxj"
  );
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Visit Evidence RLS contract (static)\n");

if (process.argv.includes("--remote")) {
  const { createReporter, runLiveRls, finishLive } = await import(
    "./lib/agentVisitEvidenceLiveQa.mjs"
  );
  const r = createReporter();
  await runLiveRls(r);
  finishLive("VE-1 RLS", r);
}
