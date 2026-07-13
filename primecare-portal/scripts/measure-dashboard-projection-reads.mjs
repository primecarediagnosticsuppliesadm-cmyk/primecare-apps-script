#!/usr/bin/env node
/**
 * Measure dashboard + executive adapter reads vs transactional baselines.
 * Targets: dashboard ≤350 ms, executive ≤400 ms (QA cold).
 *
 * Usage: node scripts/measure-dashboard-projection-reads.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const TARGET_MS = {
  dashboard_adapter: 350,
  executive_adapter: 400,
};

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}
function skip(id, detail) {
  console.log(`SKIP  ${id}: ${detail}`);
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
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

async function timed(label, fn) {
  const t0 = performance.now();
  let ok = true;
  let error = null;
  try {
    await fn();
  } catch (e) {
    ok = false;
    error = e?.message || String(e);
  }
  const ms = Math.round(performance.now() - t0);
  return { label, ms, ok, error };
}

loadEnv();

console.log("\n=== Dashboard & executive read performance ===\n");

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
const founderApi = await server.ssrLoadModule("/src/api/founderSnapshotApi.js");
await server.close();

await sb.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});

const dashDeploy = await sb.rpc("read_tenant_dashboard_v1", { p_tenant_id: QA_HQ_TENANT_ID });
const exeDeploy = await sb.rpc("read_tenant_executive_v1", { p_tenant_id: QA_HQ_TENANT_ID });

const rows = [];

rows.push(
  await timed("getAdminDashboardRead (transactional)", () =>
    api.getAdminDashboardRead({ force: true })
  )
);

if (dashDeploy.error) {
  skip("read_tenant_dashboard_v1", "Phase 2 not deployed");
} else {
  rows.push(
    await timed("read_tenant_dashboard_v1 (projection)", () =>
      sb.rpc("read_tenant_dashboard_v1", { p_tenant_id: QA_HQ_TENANT_ID })
    )
  );
}

rows.push(
  await timed("getFounderSnapshotRead (transactional RPC)", () =>
    founderApi.getFounderSnapshotRead({ tenantId: QA_HQ_TENANT_ID })
  )
);

if (exeDeploy.error) {
  skip("read_tenant_executive_v1", "Phase 2 not deployed");
} else {
  rows.push(
    await timed("read_tenant_executive_v1 (projection)", () =>
      sb.rpc("read_tenant_executive_v1", { p_tenant_id: QA_HQ_TENANT_ID })
    )
  );
}

console.log("| API | ms | target | status |");
console.log("|-----|-----|--------|--------|");
for (const r of rows) {
  let target = "—";
  if (r.label.includes("read_tenant_dashboard_v1")) target = `≤${TARGET_MS.dashboard_adapter}`;
  if (r.label.includes("read_tenant_executive_v1")) target = `≤${TARGET_MS.executive_adapter}`;
  const status = r.ok ? "OK" : r.error || "FAIL";
  console.log(`| ${r.label} | ${r.ms} | ${target} | ${status} |`);

  if (r.label.includes("read_tenant_dashboard_v1") && r.ok && r.ms > TARGET_MS.dashboard_adapter) {
    fail("perf.dashboard", `${r.ms}ms > ${TARGET_MS.dashboard_adapter}ms`);
  }
  if (r.label.includes("read_tenant_executive_v1") && r.ok && r.ms > TARGET_MS.executive_adapter) {
    fail("perf.executive", `${r.ms}ms > ${TARGET_MS.executive_adapter}ms`);
  }
  if (r.label.includes("read_tenant_dashboard_v1") && r.ok) {
    pass("perf.dashboard", `${r.ms}ms ≤ ${TARGET_MS.dashboard_adapter}ms`);
  }
  if (r.label.includes("read_tenant_executive_v1") && r.ok) {
    pass("perf.executive", `${r.ms}ms ≤ ${TARGET_MS.executive_adapter}ms`);
  }
}

console.log("");
