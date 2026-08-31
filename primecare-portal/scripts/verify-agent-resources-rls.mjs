#!/usr/bin/env node
/**
 * Agent Resources AR-1A RLS / publish protection verification (static).
 * Live role tests require applying the migration on QA; without credentials those are SKIP not PASS.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_PATH = resolve(root, "supabase/sql/agent_resources_v1_migration.sql");
const HR_GATE = resolve(root, "src/peopleOps/employee360/peopleOpsHrModuleConfig.js");
const MENU = resolve(root, "src/config/menuConfig.js");
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
assert(sql.length > 0, "sql.exists", "migration SQL present");

assert(/agent_resource_is_publisher/.test(sql), "helper.publisher", "publisher helper");
assert(/is_admin_or_executive\(\)/.test(sql), "helper.reuse_admin_exec", "reuses is_admin_or_executive");
assert(
  !/CREATE OR REPLACE FUNCTION public\.is_admin_or_executive/.test(sql),
  "helper.no_broaden",
  "does not replace is_admin_or_executive"
);

assert(/current_user_role\(\) = 'agent'/.test(sql), "agent.role", "agent role gate");
assert(
  /\(public\.current_profile\(\)\)\.user_id IS NOT NULL/.test(sql),
  "agent.active",
  "inactive denied via current_profile.user_id"
);
assert(/archived_at IS NULL/.test(sql), "agent.not_archived_resource", "archived resource excluded");
assert(/v\.status = 'published'/.test(sql), "agent.published_only", "published version only");
assert(/v\.id = r\.current_published_version_id/.test(sql), "agent.current_pointer", "current published pointer");
assert(/audience_type = 'all_agents'/.test(sql), "agent.all_agents", "all_agents path");
assert(/profile_user_id = auth\.uid\(\)/.test(sql), "agent.named", "named audience auth.uid");

assert(/agent_resources_select/.test(sql), "policy.resources_select", "resources SELECT");
assert(/agent_resources_insert/.test(sql), "policy.resources_insert", "resources create policy");
assert(/agent_resources_update/.test(sql), "policy.resources_update", "resources UPDATE");
assert(/agent_resource_versions_select/.test(sql), "policy.versions_select", "versions SELECT");
assert(/agent_resource_versions_insert/.test(sql), "policy.versions_insert", "versions insert is draft-only");
assert(/status = 'draft'/.test(sql), "policy.versions_draft_insert", "draft-only version writes");
assert(!/POLICY agent_resource_versions_update/.test(sql), "policy.no_version_update", "no client version UPDATE policy");
assert(!/POLICY agent_resource_versions_delete/.test(sql), "policy.no_version_delete", "no version DELETE policy");
assert(!/POLICY agent_resources_delete/.test(sql), "policy.no_resource_delete", "no resource DELETE policy");

assert(/agent_resource_acknowledgements_insert/.test(sql), "ack.insert_policy", "ack create policy");
assert(/profile_user_id = auth\.uid\(\)/.test(sql), "ack.self", "ack must be self");
assert(/agent_resource_version_visible_to_agent\(resource_id, version_id\)/.test(sql), "ack.visible", "ack only authorized published");
assert(!/POLICY agent_resource_acknowledgements_update/.test(sql), "ack.no_update", "no ack UPDATE");
assert(!/POLICY agent_resource_acknowledgements_delete/.test(sql), "ack.no_delete", "no ack DELETE");

assert(
  /GRANT UPDATE \([\s\S]*title[\s\S]*archived_at[\s\S]*\) ON TABLE public\.agent_resources/.test(sql),
  "grant.resource_cols",
  "column UPDATE on resources excludes current_published_version_id"
);
assert(!/GRANT UPDATE[^\n]*agent_resource_versions/.test(sql), "grant.no_version_update", "no version UPDATE grant");
assert(
  !/GRANT UPDATE \(current_published_version_id/.test(sql),
  "grant.no_pointer",
  "current_published_version_id not granted"
);
assert(/GRANT EXECUTE ON FUNCTION public\.publish_agent_resource_version/.test(sql), "grant.rpc", "RPC execute authenticated");
assert(/REVOKE ALL ON TABLE public\.agent_resources FROM anon/.test(sql), "grant.revoke_anon", "anon revoked");

assert(/agent_resource_publish_forbidden/.test(sql), "rpc.forbidden", "non-publisher rejected");
assert(/agent_resource_publish_not_draft/.test(sql), "rpc.not_draft", "non-draft rejected");
assert(/agent_resource_publish_tenant_mismatch/.test(sql), "rpc.tenant", "cross-tenant rejected");
assert(/FOR UPDATE/.test(sql), "rpc.lock", "resource/version locked");

const hrSrc = existsSync(HR_GATE) ? readFileSync(HR_GATE, "utf8") : "";
assert(/PEOPLE_OPS_HR_MODULE_ENABLED = false/.test(hrSrc), "hr.gate_unchanged", "HR Documents gate still false");

const menuSrc = existsSync(MENU) ? readFileSync(MENU, "utf8") : "";
const permSrc = existsSync(PERMS) ? readFileSync(PERMS, "utf8") : "";
assert(/agentResources/.test(menuSrc), "ui.publisher_menu", "publisher menu key present");
assert(/agentResources: \[ROLES\.EXECUTIVE, ROLES\.ADMIN, ROLES\.AGENT\]/.test(permSrc), "ui.publisher_perm", "exec+admin+agent permission");
assert(/AGENT_MENU_ORDER = \[[^\]]*agentResources/.test(menuSrc.replace(/\n/g, " ")), "ui.agent_menu", "agent menu includes Resources");
assert(/LAB_MENU_ORDER = \[[^\]]*agentResources/.test(menuSrc.replace(/\n/g, " ")) === false, "ui.no_lab_menu", "lab menu order excludes publisher");
assert(/agentResources: \[[^\]]*ROLES\.AGENT/.test(permSrc), "ui.agent_perm", "agent permitted for consumer page");
assert(!/agentResources: \[[^\]]*ROLES\.HR/.test(permSrc), "ui.no_hr_perm", "HR not in publisher permission");
assert(!/agentResources: \[[^\]]*ROLES\.LAB/.test(permSrc), "ui.no_lab_perm", "lab not in publisher permission");

if (!process.argv.includes("--remote")) {
  skip("live.roles", "pass --remote after QA apply; static policy contract verified above");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Resources RLS contract (static)\n");

if (process.argv.includes("--remote")) {
  const { runLiveRls, finishLive } = await import("./lib/agentResourcesLiveQa.mjs");
  const live = await runLiveRls();
  finishLive("Agent Resources RLS", live);
  if (live.failures || live.criticalSkips) process.exit(process.exitCode || 1);
}
