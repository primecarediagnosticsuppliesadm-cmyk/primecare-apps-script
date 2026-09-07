#!/usr/bin/env node
/**
 * verify-agent-visit-evidence-schema.mjs
 *
 * Purpose: VE-1 schema contract — additive agent_visits columns + child table.
 * Module owner: Agent Visit Evidence
 * When to run: After VE-1 SQL / before QA apply
 *
 * Usage:
 *   node scripts/verify-agent-visit-evidence-schema.mjs
 *   node scripts/verify-agent-visit-evidence-schema.mjs --remote
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const MIGRATION = resolve(
  root,
  "supabase/migrations/20260907140000_agent_visit_evidence_ve1.sql"
);
const SQL_TRACK_A = resolve(root, "supabase/sql/agent_visit_evidence_ve1_migration.sql");
const BOUNDS = resolve(root, "src/api/hqReadBounds.js");
const AWARENESS = resolve(root, "src/predator/schemaAwareness.js");
const VISIT_API = resolve(root, "src/api/primecareSupabaseApi.js");
const ACCESS = resolve(root, "src/utils/accessFilters.js");

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

const sql = existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf8") : "";
const trackA = existsSync(SQL_TRACK_A) ? readFileSync(SQL_TRACK_A, "utf8") : "";
assert(sql.length > 0, "sql.migration_exists", "VE-1 versioned migration present");
assert(existsSync(SQL_TRACK_A), "sql.track_a_copy", "Track A sql/ copy present");
assert(sql.length > 0 && sql === trackA, "sql.mirror", "Track A sql/ copy identical to versioned migration");

const ADDITIVE_COLS = [
  "visited_at",
  "decision_maker_met",
  "decision_maker_name",
  "decision_maker_role",
  "commercial_outcome",
  "lab_size_band",
  "estimated_monthly_wallet_inr",
  "wallet_range_band",
  "wallet_confidence",
  "evidence_confidence",
  "reorder_interval",
  "payment_method_or_terms",
  "approx_credit_days",
  "top_complaint",
  "top_complaint_notes",
  "updated_at",
];
for (const col of ADDITIVE_COLS) {
  assert(
    new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`).test(sql),
    `col.${col}`,
    `additive nullable ${col}`
  );
}

assert(/CREATE TABLE IF NOT EXISTS public\.agent_visit_discovery_lines/.test(sql), "child.table", "child table");
assert(/visit_uuid uuid NOT NULL/.test(sql), "child.visit_uuid", "visit_uuid uuid column");
assert(
  /REFERENCES public\.agent_visits \(id, tenant_id\)/.test(sql),
  "child.fk_uuid",
  "FK to agent_visits (id, tenant_id)"
);
assert(
  !/REFERENCES public\.agent_visits \(visit_id/.test(sql),
  "child.no_text_visit_id_fk",
  "does not FK legacy visit_id text"
);

assert(/line_kind IN \('ANALYZER', 'REAGENT', 'CONSUMABLE'\)/.test(sql), "enum.line_kind", "line kinds");
assert(/'SMALL'[\s\S]*'MEDIUM'[\s\S]*'LARGE'[\s\S]*'CHAIN_HOSPITAL'[\s\S]*'UNKNOWN'/.test(sql), "enum.size", "size bands");
assert(
  /'REQUIREMENT'[\s\S]*'QUOTE_OPPORTUNITY'[\s\S]*'FOLLOW_UP'[\s\S]*'ORDER_OPPORTUNITY'[\s\S]*'NO_OPPORTUNITY'/.test(
    sql
  ),
  "enum.outcome",
  "commercial outcomes"
);
assert(/'ESTIMATED'[\s\S]*'CUSTOMER_STATED'[\s\S]*'DOCUMENT_CONFIRMED'/.test(sql), "enum.confidence", "confidence");
assert(/'ANALYZER_SUPPORT'[\s\S]*'SOFTWARE'/.test(sql), "enum.complaint", "complaint categories");

assert(!/DROP TABLE public\.agent_visits/.test(sql), "compat.no_drop_visits", "does not drop agent_visits");
assert(!/DROP COLUMN/.test(sql), "compat.no_drop_column", "no DROP COLUMN");
assert(!/\bTRUNCATE\b/.test(sql), "compat.no_truncate", "no TRUNCATE");
assert(!/\bDELETE FROM public\./.test(sql), "compat.no_delete_from", "no DELETE FROM public tables");
assert(!/ALTER COLUMN visit_date/.test(sql), "compat.visit_date", "does not alter visit_date");
assert(!/ALTER COLUMN visit_type/.test(sql), "compat.visit_type", "does not alter visit_type");

assert(!/INSERT INTO public\.orders/.test(sql), "firewall.no_orders", "no orders write");
assert(!/INSERT INTO public\.invoices/.test(sql), "firewall.no_invoices", "no invoices write");
assert(!/INSERT INTO public\.payments/.test(sql), "firewall.no_payments", "no payments write");
assert(!/UPDATE public\.ar_credit_control/.test(sql), "firewall.no_ar", "no AR mutation");
assert(!/INSERT INTO public\.inventory/.test(sql), "firewall.no_inventory", "no inventory write");
assert(!/inventory_ledger/.test(sql), "firewall.no_ledger", "no inventory ledger");
assert(!/purchase_orders/.test(sql), "firewall.no_po", "no purchase orders");
assert(!/ordering_mode/.test(sql), "firewall.no_ordering_mode", "no ordering_mode");
assert(!/sourced_by_agent_id/.test(sql), "firewall.no_sourced_by", "no sourced_by");
assert(!/activate_prospect_lab/.test(sql), "firewall.no_activate", "no activation RPC");
assert(!/lab_qualifications/.test(sql), "firewall.no_qual_dualwrite", "no qualification dual-write");
assert(!/lab_product_intelligence/.test(sql), "firewall.no_mix_dualwrite", "no product-intelligence dual-write");

assert(!/\b50000\b/.test(sql) && !/\b8\/8\/4\b/.test(sql), "no_wallet_thresholds", "no ₹/quota thresholds");
assert(/wallet_range_band text/.test(sql), "wallet_range_unconstrained", "wallet_range_band is unconstrained text");

assert(/idx_agent_visit_discovery_lines_tenant_visit/.test(sql), "idx.visit", "index (tenant_id, visit_uuid) — child lookup by visit");
assert(/idx_agent_visit_discovery_lines_tenant_lab/.test(sql), "idx.lab", "index (tenant_id, lab_id) — RLS/lab history");

assert(/agent_visits_stamp_agent_identity/.test(sql), "stamp.visit", "visit identity stamp trigger");
assert(/current_profile\(\)|current_user_role\(\) = 'agent'/.test(sql), "stamp.profile", "uses current_profile / agent role");

const bounds = existsSync(BOUNDS) ? readFileSync(BOUNDS, "utf8") : "";
assert(
  bounds.includes("HQ_AGENT_VISIT_EVIDENCE_COLUMNS") && bounds.includes("visited_at"),
  "bounds.visit_cols",
  "HQ_AGENT_VISIT_EVIDENCE_COLUMNS includes VE-1 fields"
);
assert(
  /export const HQ_AGENT_VISIT_COLUMNS =\s*\n\s*"id,lab_id,agent_id,agent_name,visit_date,created_at,notes,visit_type,tenant_id,visit_id,follow_up_required,next_follow_up_date,next_follow_up_type,next_action";/.test(
    bounds
  ),
  "bounds.live_visits_unchanged",
  "live HQ_AGENT_VISIT_COLUMNS remains production-safe (no VE-1 cols until apply)"
);
assert(bounds.includes("HQ_AGENT_VISIT_DISCOVERY_LINE_COLUMNS"), "bounds.lines", "discovery line projection");
assert(
  !/export const HQ_AGENT_VISIT_COLUMNS =\s*\n\s*"[^"]*\*/.test(bounds),
  "bounds.no_star",
  "HQ_AGENT_VISIT_COLUMNS has no SELECT *"
);

const awareness = existsSync(AWARENESS) ? readFileSync(AWARENESS, "utf8") : "";
assert(awareness.includes("commercial_outcome"), "awareness.visit_insert", "insert whitelist includes VE-1 cols");
assert(awareness.includes("agent_visit_discovery_lines"), "awareness.child", "predator known child table");

const visitApi = existsSync(VISIT_API) ? readFileSync(VISIT_API, "utf8") : "";
assert(/function buildAgentVisitInsertRow/.test(visitApi), "compat.builder", "existing visit insert builder remains");
assert(/visit_type is required/.test(visitApi), "compat.required_visit_type", "visit_type still required in builder");
assert(/create_prospect_lab/.test(visitApi) || !sql.includes("create_prospect_lab"), "compat.prospect_rpc_untouched_in_sql", "migration does not rewrite prospect RPC");

const access = existsSync(ACCESS) ? readFileSync(ACCESS, "utf8") : "";
assert(/export function filterLabsForUser/.test(access), "compat.filter_fn", "filterLabsForUser still exported (VE-1 does not remove it)");

if (!process.argv.includes("--remote")) {
  skip("live.schema", "pass --remote after QA apply to probe information_schema");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Visit Evidence schema contract (static)\n");

if (process.argv.includes("--remote")) {
  const { createReporter, runLiveSchema, finishLive } = await import(
    "./lib/agentVisitEvidenceLiveQa.mjs"
  );
  const r = createReporter();
  await runLiveSchema(r);
  finishLive("VE-1 schema", r);
}
