#!/usr/bin/env node
/**
 * Detect high-risk manual SQL in supabase/sql that creates live objects
 * without a corresponding versioned migration (or explicit documented exception).
 *
 * Read-only. Warnings for likely drift; FAIL for critical notification/visit objects.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_FOUNDATION_MANIFEST } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sqlDir = resolve(root, "supabase/sql");
const migDir = resolve(root, "supabase/migrations");

let failures = 0;
let warnings = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}: ${msg}`);
}
function warn(id, msg) {
  console.warn(`WARN  ${id}: ${msg}`);
  warnings += 1;
}
function fail(id, msg) {
  console.error(`FAIL  ${id}: ${msg}`);
  failures += 1;
}

const migNames = existsSync(migDir)
  ? readdirSync(migDir).filter((f) => f.endsWith(".sql"))
  : [];
const migBlob = migNames.map((f) => readFileSync(resolve(migDir, f), "utf8")).join("\n");

console.log("\n=== MANUAL SQL DRIFT ===\n");

const sqlFiles = existsSync(sqlDir)
  ? readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))
  : [];

const createRe = /CREATE TABLE(?: IF NOT EXISTS)? public\.([a-z0-9_]+)/gi;
const fnRe = /CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)/gi;

for (const file of sqlFiles) {
  const text = readFileSync(resolve(sqlDir, file), "utf8");
  const isHighRisk = RELEASE_FOUNDATION_MANIFEST.highRiskManualSql.includes(file);
  const tables = new Set();
  const fns = new Set();
  for (const m of text.matchAll(createRe)) tables.add(m[1]);
  for (const m of text.matchAll(fnRe)) fns.add(m[1]);

  for (const table of tables) {
    const hasCreate = new RegExp(
      `CREATE TABLE(?: IF NOT EXISTS)? public\\.${table}\\b`,
      "i"
    ).test(migBlob);
    const hasParityTouch =
      /parity|foundation|grants/i.test(migBlob) && migBlob.includes(`public.${table}`);
    if (hasCreate) {
      pass(`sql.${file}.${table}`, "also versioned in migrations");
    } else if (RELEASE_FOUNDATION_MANIFEST.tables.includes(table)) {
      if (hasParityTouch) {
        warn(
          `sql.${file}.${table}`,
          "CREATE historically manual; parity/alter migrations exist — keep applying versioned track"
        );
      } else {
        fail(
          `sql.${file}.${table}`,
          "creates critical table in manual SQL without versioned CREATE migration"
        );
      }
    } else if (isHighRisk) {
      warn(
        `sql.${file}.${table}`,
        "high-risk manual SQL creates non-manifest table — confirm versioned coverage before prod drift"
      );
    } else {
      warn(`sql.${file}.${table}`, "manual CREATE without clear versioned twin");
    }
  }

  for (const fn of fns) {
    if (!RELEASE_FOUNDATION_MANIFEST.functions.includes(fn)) continue;
    const hasFn = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`, "i").test(migBlob);
    if (hasFn) pass(`sql.fn.${fn}`, "versioned function parity exists");
    else if (fn === "notification_event_visible_to_current_user") {
      fail(`sql.fn.${fn}`, "critical helper only in manual SQL historically — ensure versioned migration present");
    } else {
      warn(`sql.fn.${fn}`, "helper defined in manual SQL; confirm versioned coverage");
    }
  }
}

// Explicit known twins
for (const pair of [
  ["notification_delivery_log_parity.sql", "20260816150000_notification_delivery_log_parity.sql"],
  [
    "notification_event_visibility_helper_parity.sql",
    "20260816145000_notification_event_visibility_helper_parity.sql",
  ],
  ["agent_visit_authenticated_grants.sql", "20260816120000_agent_visit_authenticated_grants.sql"],
]) {
  const [sql, mig] = pair;
  if (existsSync(resolve(sqlDir, sql)) && existsSync(resolve(migDir, mig))) {
    pass(`twin.${basename(sql)}`, `mirrored by ${mig}`);
  } else if (existsSync(resolve(sqlDir, sql)) && !existsSync(resolve(migDir, mig))) {
    fail(`twin.${basename(sql)}`, `missing versioned twin ${mig}`);
  }
}

console.log(
  failures
    ? `\nMANUAL SQL DRIFT: BLOCKED (${failures} fail, ${warnings} warn)\n`
    : `\nMANUAL SQL DRIFT: PASS (${warnings} warn)\n`
);
process.exit(failures ? 1 : 0);
