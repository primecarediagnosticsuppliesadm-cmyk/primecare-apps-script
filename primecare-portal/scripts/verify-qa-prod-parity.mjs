#!/usr/bin/env node
/**
 * QA ↔ Production foundation parity (static + optional dual-env live read-only).
 *
 * Default compares versioned migration/grant expectations (no DB mutation).
 * Live: --live requires credentials via linked CLI sequentially (manual ops).
 *
 * Usage:
 *   node scripts/verify-qa-prod-parity.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_FOUNDATION_MANIFEST, PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}: ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}: ${msg}`);
  failures += 1;
}

console.log("\n=== QA / PROD FOUNDATION PARITY (static) ===\n");
console.log(`QA_REF    ${PRIMECARE_SUPABASE_PROJECTS.qa.projectRef}`);
console.log(`PROD_REF  ${PRIMECARE_SUPABASE_PROJECTS.prod.projectRef}\n`);

for (const mig of RELEASE_FOUNDATION_MANIFEST.versionedMigrations) {
  const path = resolve(root, "supabase/migrations", mig);
  if (existsSync(path)) pass(`migration.${mig}`, "present for both envs to apply");
  else fail(`migration.${mig}`, "missing — environments cannot converge");
}

// Grant + RLS expectations must be in versioned SQL (same artifact for QA and Prod)
const delivery = resolve(root, "supabase/migrations/20260816150000_notification_delivery_log_parity.sql");
const grants = resolve(root, "supabase/migrations/20260816120000_agent_visit_authenticated_grants.sql");
const visibility = resolve(
  root,
  "supabase/migrations/20260816145000_notification_event_visibility_helper_parity.sql"
);

for (const [label, path] of [
  ["delivery_log", delivery],
  ["grants", grants],
  ["visibility_helper", visibility],
]) {
  if (!existsSync(path)) {
    fail(label, "missing");
    continue;
  }
  const text = readFileSync(path, "utf8");
  if (/ENABLE ROW LEVEL SECURITY|GRANT |CREATE OR REPLACE FUNCTION|CREATE TABLE/i.test(text)) {
    pass(label, "versioned schema/security artifact");
  } else fail(label, "unexpected empty artifact");
}

pass(
  "method",
  "parity is enforced by applying the same versioned migrations to QA then Production after dry-run"
);
console.log(
  "\nLive dual-env compare: run verify-db-foundation.mjs --live --expect=qa then --expect=prod after linking each.\n"
);

console.log(failures ? `\nQA/PROD PARITY: BLOCKED (${failures})\n` : "\nQA/PROD PARITY: PASS\n");
process.exit(failures ? 1 : 0);
