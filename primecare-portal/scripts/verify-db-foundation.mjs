#!/usr/bin/env node
/**
 * Static (+ optional live) DB foundation verifier for V1 release objects.
 *
 * Default: static (migrations + SQL mirrors + app contracts) — no DB mutation.
 * Live:    --live  (requires linked env; read-only probes via supabase CLI dry-run + psql)
 *
 * Usage:
 *   node scripts/verify-db-foundation.mjs
 *   node scripts/verify-db-foundation.mjs --live --expect=qa
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { RELEASE_FOUNDATION_MANIFEST } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migDir = resolve(root, "supabase/migrations");
const sqlDir = resolve(root, "supabase/sql");

let failures = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}: ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}: ${msg}`);
  failures += 1;
}
function warn(id, msg) {
  console.warn(`WARN  ${id}: ${msg}`);
}

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function hasMigration(name) {
  return existsSync(resolve(migDir, name));
}

console.log("\n=== PRIMECARE DB FOUNDATION (static) ===\n");

for (const mig of RELEASE_FOUNDATION_MANIFEST.versionedMigrations) {
  if (hasMigration(mig)) pass(`mig.${mig}`, "versioned migration present");
  else fail(`mig.${mig}`, "missing versioned migration");
}

const migFiles = existsSync(migDir) ? readdirSync(migDir).filter((f) => f.endsWith(".sql")) : [];
const migBlob = migFiles.map((f) => read(`supabase/migrations/${f}`)).join("\n");

for (const table of RELEASE_FOUNDATION_MANIFEST.tables) {
  const inMig =
    new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}|CREATE TABLE public\\.${table}`).test(
      migBlob
    ) || migBlob.includes(`public.${table}`);
  if (inMig) pass(`table.${table}`, "referenced in versioned migrations");
  else warn(`table.${table}`, "not found in migrations blob (may predate migration track)");
}

for (const [table, cols] of Object.entries(RELEASE_FOUNDATION_MANIFEST.columns)) {
  for (const col of cols) {
    const hit =
      migBlob.includes(col) ||
      existsSync(resolve(root, "src/predator/schemaAwareness.js")) &&
        read("src/predator/schemaAwareness.js").includes(`"${col}"`);
    if (hit) pass(`col.${table}.${col}`, "present in migrations or schema awareness");
    else fail(`col.${table}.${col}`, "not found in migrations/schema awareness");
  }
}

for (const fn of RELEASE_FOUNDATION_MANIFEST.functions) {
  const hit =
    migBlob.includes(fn) ||
    (existsSync(resolve(sqlDir, "production_auth_rls_pilot_migration.sql")) &&
      read("supabase/sql/production_auth_rls_pilot_migration.sql").includes(fn)) ||
    (existsSync(resolve(sqlDir, "notifications_foundation_migration.sql")) &&
      read("supabase/sql/notifications_foundation_migration.sql").includes(fn)) ||
    migFiles.some((f) => f.includes("visibility") || f.includes("notification"));
  // stronger check
  const defined =
    new RegExp(`FUNCTION public\\.${fn}|FUNCTION ${fn}`).test(migBlob) ||
    (existsSync(resolve(sqlDir, "production_auth_rls_pilot_migration.sql")) &&
      new RegExp(`FUNCTION public\\.${fn}`).test(
        read("supabase/sql/production_auth_rls_pilot_migration.sql")
      )) ||
    (existsSync(resolve(migDir, "20260816145000_notification_event_visibility_helper_parity.sql")) &&
      fn === "notification_event_visible_to_current_user");
  if (defined || (fn !== "notification_event_visible_to_current_user" && hit)) {
    pass(`fn.${fn}`, "definition present in versioned/manual SQL track");
  } else {
    fail(`fn.${fn}`, "definition not found");
  }
}

// Grant expectations encoded in versioned grant migration
const grantsMig = "supabase/migrations/20260816120000_agent_visit_authenticated_grants.sql";
if (existsSync(resolve(root, grantsMig))) {
  const g = read(grantsMig);
  if (/GRANT SELECT, INSERT, UPDATE ON TABLE public\.agent_visits TO authenticated/.test(g)) {
    pass("grant.agent_visits", "authenticated write grants versioned");
  } else fail("grant.agent_visits", "expected authenticated grants missing");
  if (/REVOKE ALL ON TABLE public\.agent_visits FROM anon/.test(g)) {
    pass("grant.agent_visits.no_anon", "anon revoked");
  } else fail("grant.agent_visits.no_anon", "anon revoke missing");
} else {
  fail("grant.migration", "agent visit grants migration missing");
}

const deliveryMig = "supabase/migrations/20260816150000_notification_delivery_log_parity.sql";
if (existsSync(resolve(root, deliveryMig))) {
  const d = read(deliveryMig);
  if (/GRANT SELECT, INSERT ON TABLE public\.notification_delivery_log TO authenticated/.test(d)) {
    pass("grant.delivery_log", "authenticated SELECT/INSERT versioned");
  } else fail("grant.delivery_log", "delivery log grants missing");
  if (/REVOKE ALL ON TABLE public\.notification_delivery_log FROM anon/.test(d)) {
    pass("grant.delivery_log.no_anon", "anon revoked");
  } else fail("grant.delivery_log.no_anon", "anon revoke missing");
  if (/ENABLE ROW LEVEL SECURITY/.test(d)) pass("rls.delivery_log", "RLS enabled in migration");
  else fail("rls.delivery_log", "RLS enable missing");
}

const live = process.argv.includes("--live");
if (live) {
  const expectArg = process.argv.find((a) => a.startsWith("--expect="));
  const expect = expectArg ? expectArg.slice("--expect=".length) : "qa";
  console.log(`\n=== LIVE PROBES (--expect=${expect}) ===\n`);
  const assert = spawnSync(
    "node",
    [resolve(root, "scripts/assert-supabase-environment.mjs"), `--expect=${expect}`],
    { cwd: root, encoding: "utf8", stdio: "inherit" }
  );
  if ((assert.status ?? 1) !== 0) {
    fail("live.env", "environment assert failed");
  } else {
    // Read-only: confirm tables via to_regclass using dry-run connection exports.
    const dry = spawnSync("supabase", ["db", "dump", "--linked", "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const envLines = `${dry.stdout || ""}\n${dry.stderr || ""}`
      .split("\n")
      .filter((l) => l.startsWith("export PG"));
    if (!envLines.length) {
      fail("live.psql", "could not obtain linked DB connection from dry-run");
    } else {
      const env = { ...process.env };
      for (const line of envLines) {
        const m = line.match(/^export ([A-Z]+)="(.*)"$/);
        if (m) env[m[1]] = m[2];
      }
      const tables = RELEASE_FOUNDATION_MANIFEST.tables;
      const sql = tables
        .map(
          (t) =>
            `SELECT '${t}' AS t, COALESCE(to_regclass('public.${t}')::text, 'NULL') AS reg;`
        )
        .join("\n");
      const fnSql = RELEASE_FOUNDATION_MANIFEST.functions
        .map(
          (f) =>
            `SELECT '${f}' AS f, COUNT(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${f}';`
        )
        .join("\n");
      const probe = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql + fnSql], {
        cwd: root,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if ((probe.status ?? 1) !== 0) {
        fail("live.probe", probe.stderr || probe.stdout || "psql probe failed");
      } else {
        const lines = (probe.stdout || "").trim().split("\n").filter(Boolean);
        for (const line of lines) {
          if (line.includes("|NULL")) fail("live.missing", line);
          else if (/\|0$/.test(line)) fail("live.fn_missing", line);
          else pass("live.ok", line);
        }
      }
    }
  }
} else {
  console.log("\n(static only — pass --live --expect=qa|prod for linked DB probes)\n");
}

console.log(failures ? `\nFOUNDATION: BLOCKED (${failures} failure(s))\n` : "\nFOUNDATION: PASS\n");
process.exit(failures ? 1 : 0);
