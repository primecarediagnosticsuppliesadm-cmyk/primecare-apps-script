#!/usr/bin/env node
/**
 * Apply Sprint 8A Labs profile projection migration to QA Supabase.
 * Requires DATABASE_URL/SUPABASE_DB_URL in .env.local or a linked Supabase CLI.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_FILE = resolve(root, "supabase/migrations/20260705130000_sprint8a_labs_profile_projection.sql");

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

function resolveDatabaseUrl(env) {
  if (env.DATABASE_URL || env.SUPABASE_DB_URL) {
    return env.DATABASE_URL || env.SUPABASE_DB_URL;
  }
  try {
    const dry = execSync("supabase db dump --linked --dry-run 2>/dev/null", {
      cwd: root,
      encoding: "utf8",
    });
    const pgEnv = {};
    for (const line of dry.split("\n")) {
      const m = line.match(/^export (PG\w+)="([^"]*)"/);
      if (m) pgEnv[m[1]] = m[2];
    }
    if (pgEnv.PGHOST && pgEnv.PGUSER) {
      const pass = pgEnv.PGPASSWORD ? `:${encodeURIComponent(pgEnv.PGPASSWORD)}` : "";
      const port = pgEnv.PGPORT || "5432";
      const db = pgEnv.PGDATABASE || "postgres";
      return `postgresql://${pgEnv.PGUSER}${pass}@${pgEnv.PGHOST}:${port}/${db}`;
    }
  } catch {
    /* linked CLI unavailable */
  }
  return null;
}

async function probeDeployed(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.rpc("read_labs_list_v1", { p_limit: 1 });
  return !error || !/Could not find|schema cache|does not exist/i.test(error.message || "");
}

function applySqlFile(dbUrl) {
  const run = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", SQL_FILE], {
    encoding: "utf8",
  });
  if (run.status !== 0) {
    return { ok: false, reason: run.stderr || run.stdout || "psql failed" };
  }
  return { ok: true };
}

function applyViaSupabaseCli() {
  const run = spawnSync("supabase", ["db", "push", "--include-all"], {
    cwd: root,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    return { ok: false, reason: run.stderr || run.stdout || "supabase db push failed" };
  }
  return { ok: true, method: "supabase db push" };
}

async function main() {
  const env = loadEnv();
  console.log("\n=== Apply Sprint 8A Labs projection migration ===\n");

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
  }

  if (await probeDeployed(env)) {
    console.log("PASS  deploy.probe — read_labs_list_v1 already deployed");
    return;
  }

  const dbUrl = resolveDatabaseUrl(env);
  console.log(`Applying ${SQL_FILE}...`);
  let res = dbUrl
    ? applySqlFile(dbUrl)
    : { ok: false, reason: "no DATABASE_URL/SUPABASE_DB_URL from env or linked dry-run" };
  if (!res.ok) {
    console.log(`WARN  DATABASE_URL apply skipped: ${res.reason}`);
    res = applyViaSupabaseCli();
  } else {
    res.method = "psql DATABASE_URL";
  }
  if (!res.ok) {
    console.error(`FAIL  deploy.apply — ${res.reason}`);
    process.exit(1);
  }
  console.log(`PASS  deploy.apply — ${res.method}`);

  if (await probeDeployed(env)) {
    console.log("PASS  deploy.probe — read_labs_list_v1 deployed");
  } else {
    console.error("FAIL  deploy.probe — read_labs_list_v1 still unavailable");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
