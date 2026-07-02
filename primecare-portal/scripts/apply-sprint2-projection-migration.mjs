#!/usr/bin/env node
/**
 * Apply Sprint 2 domain projection migration to linked Supabase project.
 * Requires: supabase CLI linked OR DATABASE_URL in .env.local
 *
 * Usage: node scripts/apply-sprint2-projection-migration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_FILES = [
  resolve(root, "supabase/migrations/20260705120000_sprint2_domain_projections_phase1.sql"),
  resolve(root, "supabase/migrations/20260705120001_fix_proj_receivable_refresh.sql"),
  resolve(root, "supabase/migrations/20260705120002_fix_read_receivables_timeout.sql"),
];

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

async function probeDeployed(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.rpc("read_orders_list_v1", {
    p_limit: 1,
    p_offset: 0,
    p_days_back: 90,
  });
  if (!error) return true;
  const msg = error.message || "";
  if (msg.includes("Could not find the function") || msg.includes("does not exist")) {
    return false;
  }
  return true;
}

function applyViaDatabaseUrl(env) {
  const url = env.DATABASE_URL || env.SUPABASE_DB_URL;
  if (!url) return { ok: false, reason: "no DATABASE_URL" };
  for (const file of SQL_FILES) {
    const run = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", file], {
      encoding: "utf8",
    });
    if (run.status !== 0) {
      return { ok: false, reason: run.stderr || run.stdout || `psql failed: ${file}` };
    }
  }
  return { ok: true, method: "psql DATABASE_URL" };
}

function applyViaSupabaseCli() {
  const run = spawnSync(
    "supabase",
    ["db", "push", "--include-all"],
    { cwd: root, encoding: "utf8" }
  );
  if (run.status !== 0) {
    return { ok: false, reason: run.stderr || run.stdout || "supabase db push failed" };
  }
  return { ok: true, method: "supabase db push" };
}

async function main() {
  const env = loadEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
  }

  console.log("\n=== Apply Sprint 2 projection migration ===\n");

  if (await probeDeployed(env)) {
    console.log("PASS  deploy.probe — read_orders_list_v1 already available");
    return;
  }

  console.log("INFO  projection RPCs not deployed — applying migration…");

  let result = applyViaDatabaseUrl(env);
  if (!result.ok) {
    console.log(`WARN  DATABASE_URL apply skipped: ${result.reason}`);
    result = applyViaSupabaseCli();
  }

  if (!result.ok) {
    console.error(`FAIL  deploy.apply — ${result.reason}`);
    console.error(
      "\nManual: run supabase/migrations/20260705120000_sprint2_domain_projections_phase1.sql in Supabase SQL editor.\n"
    );
    process.exitCode = 1;
    return;
  }

  console.log(`PASS  deploy.apply — ${result.method}`);

  if (await probeDeployed(env)) {
    console.log("PASS  deploy.verify — RPCs available");
  } else {
    console.error("FAIL  deploy.verify — RPCs still missing after apply");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
