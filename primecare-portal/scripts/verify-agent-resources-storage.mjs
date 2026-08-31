#!/usr/bin/env node
/**
 * Agent Resources AR-1A storage contract verification (static).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_PATH = resolve(root, "supabase/sql/agent_resources_v1_migration.sql");
const EVIDENCE = resolve(root, "supabase/sql/operational_evidence_storage_migration.sql");
const INVOICE = resolve(root, "supabase/sql/invoice_system_phase1_migration.sql");

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
assert(Boolean(sql), "sql.exists", "agent resources SQL present");

assert(/INSERT INTO storage\.buckets/.test(sql), "bucket.insert", "creates bucket");
assert(/'agent-resources'/.test(sql), "bucket.id", "id agent-resources");
assert(/public = false/.test(sql), "bucket.public_false", "public = false");
assert(/10485760/.test(sql), "bucket.limit", "10 MiB");
assert(
  /ARRAY\['application\/pdf', 'image\/jpeg', 'image\/png'\]/.test(sql),
  "bucket.mime",
  "PDF/JPEG/PNG only"
);

assert(/agent_resources_storage_select/.test(sql), "policy.select", "storage SELECT policy");
assert(/agent_resources_storage_insert/.test(sql), "policy.insert", "storage create policy");
assert(/agent_resource_storage_can_read\(name\)/.test(sql), "policy.read_fn", "read via metadata helper");
assert(/agent_resource_storage_can_insert\(name\)/.test(sql), "policy.insert_fn", "upload requires matching draft metadata");
assert(/v\.status = 'draft'/.test(sql), "insert.draft_only", "upload only for draft version path");
assert(!/POLICY agent_resources_storage_update/.test(sql), "policy.no_update", "no storage UPDATE");
assert(!/POLICY agent_resources_storage_delete/.test(sql), "policy.no_delete", "no storage DELETE");
assert(!/getPublicUrl/.test(sql), "no.public_url", "no public URL helper");

assert(/split_part\(storage_path, '\/', 1\) = tenant_id::text/.test(sql), "path.tenant", "path tenant segment");
assert(/split_part\(storage_path, '\/', 2\) = resource_id::text/.test(sql), "path.resource", "path resource segment");
assert(/split_part\(storage_path, '\/', 3\) = id::text/.test(sql), "path.version", "path version segment");
assert(/position\('\.\.' in storage_path\) = 0/.test(sql), "path.no_dotdot", "no path traversal");
assert(/original_filename text/.test(sql), "meta.filename", "original filename metadata only");

assert(!/bucket_id = 'operational-evidence'/.test(sql), "no.evidence_bucket", "does not policy evidence bucket");
assert(!/bucket_id = 'invoice-pdfs'/.test(sql), "no.invoice_bucket", "does not policy invoice bucket");

const evidence = existsSync(EVIDENCE) ? readFileSync(EVIDENCE, "utf8") : "";
const invoice = existsSync(INVOICE) ? readFileSync(INVOICE, "utf8") : "";
assert(/operational-evidence/.test(evidence), "regression.evidence_file", "evidence migration file unchanged presence");
assert(/invoice-pdfs/.test(invoice), "regression.invoice_file", "invoice bucket still in phase1 SQL");
assert(!/agent-resources/.test(evidence), "regression.evidence_clean", "evidence SQL does not mention agent-resources");
assert(!/agent-resources/.test(invoice), "regression.invoice_clean", "invoice SQL does not mention agent-resources");

if (!process.argv.includes("--remote")) {
  skip("live.storage", "static storage contract only; --remote after QA apply");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Resources storage (static)\n");

if (process.argv.includes("--remote")) {
  const { runLiveStorage, finishLive } = await import("./lib/agentResourcesLiveQa.mjs");
  const live = await runLiveStorage();
  finishLive("Agent Resources storage", live);
  if (live.failures || live.criticalSkips) process.exit(process.exitCode || 1);
}
