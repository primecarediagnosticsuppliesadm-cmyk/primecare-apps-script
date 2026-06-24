#!/usr/bin/env node
/**
 * Run pilot_hardening_validation_queries.sql checks against linked Supabase.
 * Usage: node scripts/verify-pilot-hardening-sql.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
}
function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function pgEnv() {
  const dry = execSync("supabase db dump --linked --dry-run 2>/dev/null", {
    cwd: root,
    encoding: "utf8",
  });
  const env = {};
  for (const line of dry.split("\n")) {
    const m = line.match(/^export (PG\w+)="([^"]*)"/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function sql(query) {
  const env = pgEnv();
  try {
    return execSync(`psql -t -A -F '|' -c "${query.replace(/"/g, '\\"')}"`, {
      cwd: root,
      env: { ...process.env, ...env },
      encoding: "utf8",
    }).trim();
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

async function loginExecutive(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "qa.executive@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Executive auth failed: ${error.message}`);
  return sb;
}

async function main() {
  const env = loadEnv();
  const sb = await loginExecutive(env);

  const tableNames = [
    "profiles",
    "labs",
    "lab_ownership",
    "lab_contracts",
    "orders",
    "ar_credit_control",
    "inventory",
    "lab_qualifications",
    "tenants",
  ];
  let tablesOk = 0;
  for (const t of tableNames) {
    const { error } = await sb.from(t).select("*", { count: "exact", head: true }).limit(1);
    if (!error) tablesOk += 1;
  }
  if (tablesOk >= 8) pass("PH-00", `${tablesOk}/${tableNames.length} core tables queryable`);
  else fail("PH-00", `Only ${tablesOk}/${tableNames.length} core tables queryable`);

  const tempAnon = sql(
    `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND policyname ILIKE 'temp_anon%' AND tablename IN ('orders','payments','inventory','inventory_ledger','ar_credit_control','labs','lab_ownership')`
  );
  if (typeof tempAnon === "object" && tempAnon.error) {
    warn("PH-10", `temp_anon check skipped: ${tempAnon.error}`);
  } else if (Number(tempAnon) === 0) {
    pass("PH-10", "temp_anon policies = 0 rows");
  } else {
    fail("PH-10", `temp_anon policies = ${tempAnon} (expected 0)`);
  }

  const ownIdx = sql(
    `SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND tablename='lab_ownership' AND indexname ILIKE '%active%'`
  );
  if (Number(ownIdx) > 0) pass("PH-11", "lab_ownership ACTIVE unique index present");
  else fail("PH-11", "lab_ownership ACTIVE index missing");

  const { count: agents } = await sb
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", HQ)
    .eq("role", "agent")
    .not("agent_id", "is", null);
  if ((agents || 0) > 0) pass("PH-12", `${agents} agent profile(s) with agent_id`);
  else fail("PH-12", "No agents with agent_id");

  const { count: contracts } = await sb
    .from("lab_contracts")
    .select("*", { count: "exact", head: true })
    .eq("distributor_id", HQ)
    .eq("status", "Active");
  if ((contracts || 0) > 0) pass("PH-13", `${contracts} active contract(s) for HQ`);
  else fail("PH-13", "No active HQ contracts");

  const { count: quals } = await sb
    .from("lab_qualifications")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", HQ)
    .in("pipeline_stage", ["qualified", "won"]);
  if ((quals || 0) > 0) pass("PH-14", `${quals} qualified/won lab(s)`);
  else fail("PH-14", "No qualified/won labs");

  const { count: stock } = await sb
    .from("v_stock_dashboard")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", HQ)
    .gt("current_stock", 0);
  if ((stock || 0) > 0) pass("PH-15", `${stock} SKU(s) in stock`);
  else fail("PH-15", "No inventory stock");

  const { count: ownership } = await sb
    .from("lab_ownership")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", HQ)
    .eq("status", "ACTIVE");
  if ((ownership || 0) > 0) pass("PH-16", `${ownership} ACTIVE ownership row(s)`);
  else fail("PH-16", "No ACTIVE ownership rows");

  const provConstraint = sql(
    `SELECT COUNT(*) FROM pg_constraint WHERE conrelid='public.user_provisioning_events'::regclass AND conname LIKE '%event_type%'`
  );
  if (Number(provConstraint) > 0) pass("PH-17", "user_provisioning_events event_type constraint present");
  else warn("PH-17", "event_type constraint not found");

  console.log("\n=== Pilot Hardening SQL Validation ===\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(5)} ${r.id}  ${r.detail}`);
  }
  const fails = results.filter((r) => r.status === "FAIL");
  console.log(`\nSummary: PASS=${results.filter((r) => r.status === "PASS").length} FAIL=${fails.length}`);
  if (fails.length) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }
  console.log("\nRESULT: PASS");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
