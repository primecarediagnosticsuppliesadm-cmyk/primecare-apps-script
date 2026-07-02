#!/usr/bin/env node
/**
 * Apply Sprint 3A production safety hardening migration to QA Supabase.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_FILE = resolve(
  root,
  "supabase/migrations/20260702170000_sprint3a_production_safety_hardening.sql"
);

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
  const { data, error } = await sb.rpc("_proj_assert_refresh_access_v1", {
    p_tenant_id: "f168b98f-47a6-42c3-b788-24c00436fac2",
  });
  void data;
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
  const run = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", SQL_FILE], {
    encoding: "utf8",
  });
  if (run.status !== 0) {
    return { ok: false, reason: run.stderr || run.stdout || "psql failed" };
  }
  return { ok: true, method: "psql DATABASE_URL" };
}

async function main() {
  const env = loadEnv();
  console.log("\n=== Apply Sprint 3A production safety migration ===\n");

  if (await probeDeployed(env)) {
    console.log("PASS  deploy.probe — _proj_assert_refresh_access_v1 already available");
    return;
  }

  const result = applyViaDatabaseUrl(env);
  if (!result.ok) {
    console.error(`FAIL  deploy.apply — ${result.reason}`);
    console.error(
      "\nManual: run supabase/migrations/20260702170000_sprint3a_production_safety_hardening.sql in Supabase SQL editor.\n"
    );
    process.exit(1);
  }
  console.log(`PASS  deploy.apply — ${result.method}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
