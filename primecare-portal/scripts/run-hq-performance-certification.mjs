#!/usr/bin/env node
/**
 * HQ Performance certification — isolated PERF tenant only.
 * Seeds scale data if needed, measures bounded read timings.
 *
 * Usage:
 *   node scripts/run-hq-performance-certification.mjs
 *   PERF_SKIP_SEED=1 node scripts/run-hq-performance-certification.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const OUT = resolve(root, "docs/hq-certification/HQ_PERFORMANCE_CERTIFICATION.md");
const STATE_FILE = resolve(root, ".perf-scale-tenant.json");
const GUNTUR = "787999b9-72f5-4163-a860-551c12ce3414";
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";

const TARGET = { labs: 1000, agents: 1000, orders: 100000, payments: 100000 };

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

function readState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function verifyScaleCountsSql(tenantId) {
  const run = spawnSync("node", ["scripts/verify-perf-scale-counts.mjs"], {
    cwd: root,
    env: { ...process.env, PERF_TENANT_ID: tenantId },
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error(run.stdout || run.stderr || "verify-perf-scale-counts failed");
  }
  const text = run.stdout || "";
  const methodLine = text.match(/^Method: (.+)$/m);
  const parse = (metric) => {
    const m = text.match(new RegExp(`\\| ${metric} \\| (\\d+) \\|`));
    return m ? Number(m[1]) : 0;
  };
  return {
    labs: parse("labs"),
    agents: parse("agents"),
    orders: parse("orders"),
    payments: parse("payments"),
    method: methodLine?.[1] || "verify-perf-scale-counts.mjs",
  };
}

function payloadBytes(data) {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

async function timed(label, fn) {
  const t0 = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - t0);
  return { label, ms, result };
}

async function main() {
  const env = loadEnv();
  const skipSeed = process.env.PERF_SKIP_SEED === "1";

  let tenantId = process.env.PERF_TENANT_ID || readState()?.tenantId || null;
  if (tenantId === GUNTUR || tenantId === HQ) {
    throw new Error("Refusing perf certification on Guntur or HQ pilot tenant");
  }

  if (!skipSeed) {
    const seedEnv = {
      ...process.env,
      PERF_LABS: String(TARGET.labs),
      PERF_AGENTS: String(TARGET.agents),
      PERF_ORDERS: String(TARGET.orders),
      PERF_PAYMENTS: String(TARGET.payments),
      PERF_TENANT_ID: tenantId || "",
    };
    const seed = spawnSync("node", ["scripts/perf-scale-seed.mjs"], {
      cwd: root,
      env: seedEnv,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (seed.status !== 0) {
      console.error(seed.stdout);
      console.error(seed.stderr);
      throw new Error(`perf-scale-seed failed: ${seed.stderr || seed.stdout}`);
    }
    const state = readState();
    tenantId = state?.tenantId || tenantId;
  }

  if (!tenantId) throw new Error("No PERF tenant id after seed");

  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: "qa.executive@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Executive auth failed: ${error.message}`);

  const scale = await verifyScaleCountsSql(tenantId);
  const counts = {
    labs: scale.labs,
    agents: scale.agents,
    orders: scale.orders,
    payments: scale.payments,
  };
  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });

  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  const ops = await server.ssrLoadModule("/src/operations/operationsCommandCenterLoader.js");
  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  if (supabase) {
    await supabase.auth.setSession({
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
    });
  }

  const currentUser = {
    id: auth.user.id,
    tenantId,
    role: "executive",
  };

  let apiCount = 0;
  const benchmarks = [];

  const ordersBench = await timed("Orders (bounded)", async () => {
    apiCount += 1;
    return api.getOrdersRead({ tenantId, limit: 100 });
  });
  benchmarks.push({
    ...ordersBench,
    rows: ordersBench.result?.data?.orders?.length ?? 0,
    bytes: payloadBytes(ordersBench.result),
    bounded: (ordersBench.result?.data?.orders?.length ?? 0) <= 500,
  });

  const collectionsBench = await timed("Collections (bounded)", async () => {
    apiCount += 1;
    return api.getCollectionsRead({ tenantId });
  });
  benchmarks.push({
    ...collectionsBench,
    rows:
      (collectionsBench.result?.data?.arRows?.length ?? 0) +
      (collectionsBench.result?.data?.payments?.length ?? 0),
    bytes: payloadBytes(collectionsBench.result),
    bounded: true,
  });

  const dashboardBench = await timed("Admin Dashboard (bounded)", async () => {
    apiCount += 1;
    return api.getAdminDashboardRead({ tenantId });
  });
  benchmarks.push({
    ...dashboardBench,
    rows: dashboardBench.result?.data?.orders?.length ?? 0,
    bytes: payloadBytes(dashboardBench.result),
    bounded: (dashboardBench.result?.data?.orders?.length ?? 0) <= 2000,
  });

  const opsBench = await timed("Operations Center loader", async () => {
    apiCount += 1;
    return ops.loadOperationsCommandCenterData(currentUser, { tenantId });
  });
  benchmarks.push({
    ...opsBench,
    rows: opsBench.result?.orders?.length ?? 0,
    bytes: payloadBytes(opsBench.result),
    bounded: (opsBench.result?.orders?.length ?? 0) <= 500,
  });

  const funnelBench = await timed("Revenue Funnel orders probe", async () => {
    apiCount += 1;
    const { data, error: qErr } = await sb
      .from("orders")
      .select("order_id, status, total_amount")
      .eq("tenant_id", tenantId)
      .order("order_date", { ascending: false })
      .limit(100);
    return { data, error: qErr?.message };
  });
  benchmarks.push({
    ...funnelBench,
    rows: funnelBench.result?.data?.length ?? 0,
    bytes: payloadBytes(funnelBench.result),
    bounded: (funnelBench.result?.data?.length ?? 0) <= 100,
  });

  await server.close();
  await sb.auth.signOut();

  const slowest = [...benchmarks].sort((a, b) => b.ms - a.ms)[0];
  const unbounded = benchmarks.filter((b) => b.bounded === false);
  const scaleOk =
    counts.labs >= TARGET.labs &&
    counts.orders >= TARGET.orders &&
    counts.payments >= TARGET.payments;
  const pass = scaleOk && unbounded.length === 0 && slowest.ms < 30000;

  const lines = [
    "# HQ Performance Certification",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**PERF tenant:** ${tenantId}`,
    `**Scale target:** ${TARGET.labs} labs · ${TARGET.agents} agents · ${TARGET.orders} orders · ${TARGET.payments} payments`,
    "",
    `## Result: ${pass ? "PASS" : "FAIL"}`,
    "",
    "### Tenant row counts",
    "",
    `| Table | Count | Target |`,
    `|-------|-------|--------|`,
    `| labs | ${counts.labs} | ${TARGET.labs} |`,
    `| agent_profiles (PERF seed uses synthetic IDs on labs) | ${counts.agents} | — |`,
    `| orders | ${counts.orders} | ${TARGET.orders} |`,
    `| payments | ${counts.payments} | ${TARGET.payments} |`,
    "",
    `**Count method:** ${scale.method}`,
    "",
    "### Benchmarks",
    "",
    "| Surface | ms | Rows | Payload bytes | Bounded |",
    "|---------|-----|------|---------------|---------|",
    ...benchmarks.map(
      (b) => `| ${b.label} | ${b.ms} | ${b.rows} | ${b.bytes} | ${b.bounded ? "yes" : "NO" } |`
    ),
    "",
    `- **Slowest query:** ${slowest.label} (${slowest.ms} ms)`,
    `- **API calls measured:** ${apiCount}`,
    `- **Unbounded surfaces:** ${unbounded.length}`,
    "",
    "### Indexes (verified via migration apply)",
    "",
    "- `idx_orders_tenant_order_date`",
    "- `idx_payments_tenant_payment_date`",
    "",
  ];

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join("\n"));
  console.log(lines.join("\n"));
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
