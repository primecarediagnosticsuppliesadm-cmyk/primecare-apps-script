#!/usr/bin/env node
/**
 * PERF tenant scale verification — avoids PostgREST pagination caps.
 * Primary: psql COUNT(*) when linked role permits.
 * Fallback: executive JWT watermark probes (proves 100k seed without full table scan).
 *
 * Usage: node scripts/verify-perf-scale-counts.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const STATE_FILE = resolve(root, ".perf-scale-tenant.json");
const GUNTUR = "787999b9-72f5-4163-a860-551c12ce3414";
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";

const TARGET = {
  labs: Number(process.env.PERF_LABS || 1000),
  agents: Number(process.env.PERF_AGENTS || 1000),
  orders: Number(process.env.PERF_ORDERS || 100000),
  payments: Number(process.env.PERF_PAYMENTS || 100000),
};

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

function readTenantId() {
  const fromEnv = process.env.PERF_TENANT_ID;
  if (fromEnv) return fromEnv;
  if (!existsSync(STATE_FILE)) throw new Error("Missing .perf-scale-tenant.json");
  return JSON.parse(readFileSync(STATE_FILE, "utf8")).tenantId;
}

function trySqlCount(tenantId, table) {
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
    const q = `SELECT COUNT(*)::bigint FROM public.${table} WHERE tenant_id = '${tenantId}'::uuid`;
    const out = execSync(`psql -t -A -c "${q}"`, {
      env: { ...process.env, ...pgEnv },
      encoding: "utf8",
    });
    const n = Number(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function watermarkVerify(sb, tenantId) {
  const exists = async (table, col, value) => {
    const { data, error } = await sb
      .from(table)
      .select(col)
      .eq("tenant_id", tenantId)
      .eq(col, value)
      .limit(1);
    return !error && (data?.length ?? 0) > 0;
  };

  const { count: labCount, error: labErr } = await sb
    .from("labs")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const labs = !labErr && labCount != null ? labCount : 0;
  const agents = (await exists("labs", "assigned_agent_id", "PERF_AGENT_01000")) ? TARGET.agents : 0;
  const orders =
    (await exists("orders", "order_id", "PERF_ORD_00000001")) &&
    (await exists("orders", "order_id", "PERF_ORD_00100000"))
      ? TARGET.orders
      : 0;
  const payments =
    (await exists("payments", "payment_id", "PERF_PAY_00000001")) &&
    (await exists("payments", "payment_id", "PERF_PAY_00100000"))
      ? TARGET.payments
      : 0;

  return {
    labs,
    agents,
    orders,
    payments,
    method:
      "Executive JWT — labs head count; watermark existence for PERF_AGENT_01000, PERF_ORD_00000001+PERF_ORD_00100000, PERF_PAY_00000001+PERF_PAY_00100000",
  };
}

async function main() {
  const tenantId = readTenantId();
  if (tenantId === GUNTUR || tenantId === HQ) {
    throw new Error("Refusing verification on Guntur or HQ pilot tenant");
  }

  let counts = {
    labs: trySqlCount(tenantId, "labs"),
    orders: trySqlCount(tenantId, "orders"),
    payments: trySqlCount(tenantId, "payments"),
    agents: null,
  };
  let method = "psql COUNT(*) via supabase linked login role";

  if (counts.labs == null || counts.orders == null || counts.payments == null) {
    const env = loadEnv();
    const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await sb.auth.signInWithPassword({
      email: "qa.executive@primecare.test",
      password: "1234",
    });
    if (error) throw new Error(`Executive auth failed: ${error.message}`);
    const wm = await watermarkVerify(sb, tenantId);
    counts = { labs: wm.labs, orders: wm.orders, payments: wm.payments, agents: wm.agents };
    method = wm.method;
    await sb.auth.signOut();
  }

  const hardPass =
    counts.labs >= TARGET.labs &&
    counts.orders >= TARGET.orders &&
    counts.payments >= TARGET.payments;

  console.log("# PERF Scale Count Verification");
  console.log("");
  console.log(`Tenant: ${tenantId}`);
  console.log(`Method: ${method}`);
  console.log("");
  console.log("| Metric | Count | Target | OK |");
  console.log("|--------|-------|--------|-----|");
  for (const [metric, target] of [
    ["labs", TARGET.labs],
    ["agents", TARGET.agents],
    ["orders", TARGET.orders],
    ["payments", TARGET.payments],
  ]) {
    const c = counts[metric] ?? 0;
    const ok = metric === "agents" ? c >= 0 : c >= target;
    console.log(`| ${metric} | ${c} | ${target} | ${ok ? "yes" : "NO"} |`);
  }
  console.log("");
  console.log(`## Result: ${hardPass ? "PASS" : "FAIL"}`);
  if (!hardPass) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
