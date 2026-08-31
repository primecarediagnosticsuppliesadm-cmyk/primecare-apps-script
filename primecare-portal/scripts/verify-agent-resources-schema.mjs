#!/usr/bin/env node
/**
 * Agent Resources AR-1A schema verification.
 * Default: static SQL contract. --remote: live QA schema/RLS/grants (refuses Production).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_PATH = resolve(root, "supabase/sql/agent_resources_v1_migration.sql");
const MIGRATION_PATH = resolve(root, "supabase/migrations/20260831200000_agent_resources_v1.sql");
const LOCKDOWN_SQL = resolve(root, "supabase/sql/agent_resources_v1_privilege_lockdown.sql");
const LOCKDOWN_MIG = resolve(
  root,
  "supabase/migrations/20260831201000_agent_resources_v1_privilege_lockdown.sql"
);

const TABLES = [
  "agent_resources",
  "agent_resource_versions",
  "agent_resource_audiences",
  "agent_resource_acknowledgements",
];

const FORBIDDEN = [
  /ALTER\s+TABLE\s+public\.orders\b/i,
  /ALTER\s+TABLE\s+public\.invoices\b/i,
  /ALTER\s+TABLE\s+public\.payments\b/i,
  /ALTER\s+TABLE\s+public\.ar_credit_control\b/i,
  /ALTER\s+TABLE\s+public\.inventory\b/i,
  /ALTER\s+TABLE\s+public\.inventory_ledger\b/i,
  /ALTER\s+TABLE\s+public\.purchase_orders\b/i,
  /ALTER\s+TABLE\s+public\.operational_evidence\b/i,
  /bucket_id\s*=\s*'operational-evidence'/i,
  /bucket_id\s*=\s*'invoice-pdfs'/i,
  /INSERT INTO storage\.buckets[\s\S]*operational-evidence/i,
  /INSERT INTO storage\.buckets[\s\S]*invoice-pdfs/i,
];

let failures = 0;
function pass(id, d) {
  console.log(`PASS  ${id}: ${d}`);
}
function fail(id, d) {
  console.error(`FAIL  ${id}: ${d}`);
  failures += 1;
}
function assert(c, id, d) {
  if (c) pass(id, d);
  else fail(id, d);
}

if (!existsSync(SQL_PATH)) fail("file.sql", `missing ${SQL_PATH}`);
if (!existsSync(MIGRATION_PATH)) fail("file.migration", `missing ${MIGRATION_PATH}`);
if (!existsSync(LOCKDOWN_SQL)) fail("file.lockdown_sql", `missing ${LOCKDOWN_SQL}`);
if (!existsSync(LOCKDOWN_MIG)) fail("file.lockdown_migration", `missing ${LOCKDOWN_MIG}`);

const sql = existsSync(SQL_PATH) ? readFileSync(SQL_PATH, "utf8") : "";
const mig = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf8") : "";
const lockdownSql = existsSync(LOCKDOWN_SQL) ? readFileSync(LOCKDOWN_SQL, "utf8") : "";
const lockdownMig = existsSync(LOCKDOWN_MIG) ? readFileSync(LOCKDOWN_MIG, "utf8") : "";
assert(sql.length > 0 && sql === mig, "file.mirror", "sql mirror identical to timestamped migration");
assert(
  lockdownSql.length > 0 && lockdownSql === lockdownMig,
  "file.lockdown_mirror",
  "privilege lockdown sql mirror identical"
);
assert(
  /REVOKE ALL ON TABLE public\.agent_resources FROM authenticated/.test(sql),
  "grant.revoke_authenticated",
  "strips default ALL from authenticated"
);

for (const table of TABLES) {
  assert(
    new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, "i").test(sql),
    `table.${table}`,
    "CREATE TABLE"
  );
  assert(
    new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i").test(sql),
    `rls.enable.${table}`,
    "RLS enabled"
  );
}

assert(/UNIQUE \(resource_id, version_number\)/.test(sql), "uq.version_number", "unique version number");
assert(
  /agent_resource_versions_one_published[\s\S]*WHERE status = 'published'/.test(sql),
  "uq.one_published",
  "partial unique published"
);
assert(
  /UNIQUE \(tenant_id, version_id, profile_user_id\)/.test(sql),
  "uq.ack",
  "acknowledgement unique"
);
assert(/UNIQUE \(resource_id, profile_user_id\)/.test(sql), "uq.audience", "audience unique");
assert(/version_number >= 1/.test(sql), "check.version_number", "version_number >= 1");
assert(/file_size > 0 AND file_size <= 10485760/.test(sql), "check.file_size", "file_size 1..10MiB");
assert(/'application\/pdf'/.test(sql) && /'image\/jpeg'/.test(sql) && /'image\/png'/.test(sql), "check.mime", "MIME allowlist");
assert(/'start_here'/.test(sql) && /'lab_os'/.test(sql), "check.category", "categories");
assert(/'all_agents'/.test(sql) && /'named_agents'/.test(sql), "check.audience_type", "audience types");
assert(/'draft'[\s\S]*'published'[\s\S]*'archived'/.test(sql), "check.status", "version statuses");

assert(/REFERENCES public\.profiles\(user_id\)/.test(sql), "fk.profile", "audiences/acks → profiles.user_id");
assert(
  /FOREIGN KEY \(resource_id, tenant_id\)[\s\S]*REFERENCES public\.agent_resources/.test(sql),
  "fk.child_tenant",
  "composite resource+tenant FK"
);
assert(
  /agent_resources_current_published_fk[\s\S]*REFERENCES public\.agent_resource_versions \(id, resource_id, tenant_id\)/.test(sql),
  "fk.current_published",
  "current published points at same resource/tenant"
);
assert(
  /FOREIGN KEY \(version_id, resource_id, tenant_id\)/.test(sql),
  "fk.ack_version",
  "ack version belongs to resource+tenant"
);
assert(/idx_agent_resources_tenant_updated/.test(sql), "idx.resources", "tenant updated index");
assert(/idx_agent_resource_versions_tenant_resource/.test(sql), "idx.versions", "versions index");
assert(/idx_agent_resource_audiences_profile/.test(sql), "idx.audiences", "audiences index");
assert(/idx_agent_resource_acks_tenant_version/.test(sql), "idx.acks", "acks index");

assert(
  /CREATE OR REPLACE FUNCTION public\.publish_agent_resource_version\(p_version_id uuid\)/.test(sql),
  "rpc.publish",
  "publish RPC declared"
);
assert(/SECURITY DEFINER/.test(sql) && /SET search_path = public/.test(sql), "rpc.security", "DEFINER + search_path");
assert(/agent_resource_publish_named_audience_empty/.test(sql), "rpc.named", "named audience required");
assert(/status = 'archived'/.test(sql) && /current_published_version_id = p_version_id/.test(sql), "rpc.swap", "archive previous + pointer");

assert(/'agent-resources'/.test(sql), "bucket.name", "bucket agent-resources");
assert(/public = false/.test(sql), "bucket.private", "bucket private");
assert(/10485760/.test(sql), "bucket.size", "10 MiB limit");

assert(!/docx|wordprocessingml|application\/zip/i.test(sql), "no.docx", "no DOCX/zip MIME");
assert(!/\bSELECT \*/.test(sql), "no.select_star", "no SELECT * in SQL body (ROWTYPE excepted)");

for (const pattern of FORBIDDEN) {
  assert(!pattern.test(sql), `forbidden.${pattern.source.slice(0, 40)}`, "O2C/evidence/invoice untouched");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Resources schema (static)\n");

if (process.argv.includes("--remote")) {
  const { runLiveSchema, finishLive } = await import("./lib/agentResourcesLiveQa.mjs");
  const live = await runLiveSchema();
  finishLive("Agent Resources schema", live);
  if (live.failures || live.criticalSkips) process.exit(process.exitCode || 1);
}
