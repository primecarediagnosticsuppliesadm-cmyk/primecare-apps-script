#!/usr/bin/env node
/**
 * Apply Sprint 5A SQL migrations to QA Supabase.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const MIGRATIONS = [
  "20260705120002_fix_read_receivables_timeout.sql",
  "20260705120003_sprint5a_founder_snapshot_projection.sql",
  "20260705120004_sprint5a_receivables_tenant_scope.sql",
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

async function probeReceivablesFix(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.rpc("read_lab_receivables_list_v1", {
    p_limit: 100,
    p_days_back: 90,
  });
  if (!error) return true;
  const msg = error.message || "";
  if (msg.includes("statement timeout")) return false;
  return !msg.includes("Could not find the function");
}

async function probeFounderProjection(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const t0 = performance.now();
  const { data, error } = await sb.rpc("get_founder_snapshot", {
    p_tenant_id: "f168b98f-47a6-42c3-b788-24c00436fac2",
  });
  const ms = Math.round(performance.now() - t0);
  if (error) return { ok: false, ms, error: error.message };
  const hasKeys =
    data &&
    typeof data === "object" &&
    "revenue_today" in data &&
    "outstanding_ar" in data;
  return { ok: hasKeys && ms < 5000, ms, error: hasKeys ? null : "missing keys" };
}

function applySqlFile(dbUrl, file) {
  const run = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", file], {
    encoding: "utf8",
  });
  if (run.status !== 0) {
    return { ok: false, reason: run.stderr || run.stdout || "psql failed" };
  }
  return { ok: true };
}

async function main() {
  const env = loadEnv();
  console.log("\n=== Apply Sprint 5A migrations ===\n");

  const receivablesOk = await probeReceivablesFix(env);
  const founderProbe = await probeFounderProjection(env);
  if (receivablesOk && founderProbe.ok && founderProbe.ms < 500) {
    console.log("PASS  deploy.probe — receivables RPC + founder snapshot already optimized");
    console.log(`PASS  founder.ms — ${founderProbe.ms}ms`);
    return;
  }

  const dbUrl = resolveDatabaseUrl(env);
  if (!dbUrl) {
    console.error("FAIL  deploy.apply — no DATABASE_URL or linked supabase CLI");
    console.error("\nManual: run these in Supabase SQL editor:");
    for (const f of MIGRATIONS) console.error(`  - supabase/migrations/${f}`);
    process.exit(1);
  }

  for (const file of MIGRATIONS) {
    const path = resolve(root, "supabase/migrations", file);
    console.log(`Applying ${file}...`);
    const res = applySqlFile(dbUrl, path);
    if (!res.ok) {
      console.error(`FAIL  ${file} — ${res.reason}`);
      process.exit(1);
    }
    console.log(`PASS  ${file}`);
  }

  const afterReceivables = await probeReceivablesFix(env);
  const afterFounder = await probeFounderProjection(env);
  console.log(`\nProbe receivables: ${afterReceivables ? "PASS" : "FAIL"}`);
  console.log(`Probe founder: ${afterFounder.ok ? "PASS" : "FAIL"} (${afterFounder.ms}ms)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
