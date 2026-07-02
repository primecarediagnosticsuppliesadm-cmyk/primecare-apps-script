#!/usr/bin/env node
/**
 * Dashboard projection parity — read_tenant_dashboard_v1 vs getAdminDashboardRead scalars.
 * Sprint 2 Phase 2 certification (Blueprint 18).
 *
 * Usage: node scripts/verify-dashboard-projection-parity.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCALAR_PATHS = [
  ["executive.todaysRevenue", (d) => d?.executive?.todaysRevenue],
  ["executive.outstandingReceivables", (d) => d?.executive?.outstandingReceivables],
  ["executive.labsAtCreditRisk", (d) => d?.executive?.labsAtCreditRisk],
  ["executive.productsNearStockout", (d) => d?.executive?.productsNearStockout],
  ["summary.todayCollections", (d) => d?.summary?.todayCollections],
  ["summary.totalSoldValue", (d) => d?.summary?.totalSoldValue],
  ["summary.recentVisits", (d) => d?.summary?.recentVisits],
  ["summary.stockStats.criticalItems", (d) => d?.summary?.stockStats?.criticalItems],
];

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
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

function withinTolerance(a, b, path) {
  const na = num(a);
  const nb = num(b);
  if (na === nb) return true;
  const money = /revenue|receivable|collection|sold/i.test(path);
  const tol = money ? 1 : 0;
  return Math.abs(na - nb) <= tol;
}

loadEnv();

console.log("\n=== Dashboard projection parity (adapter vs transactional) ===\n");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
await server.close();

const auth = await supabase.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});
if (auth.error) fail("auth.admin", auth.error.message);
else pass("auth.admin", QA_ADMIN.email);

const deployProbe = await supabase.rpc("read_tenant_dashboard_v1", {
  p_tenant_id: QA_HQ_TENANT_ID,
});
if (deployProbe.error) {
  const missing = /read_tenant_dashboard_v1|does not exist/i.test(deployProbe.error.message || "");
  if (missing) {
    skip("deploy.dashboard_adapter", "Phase 2 migration not deployed — design gate only");
    console.log("\n=== Dashboard parity skipped (design phase) ===\n");
    process.exit(0);
  }
  fail("deploy.dashboard_adapter", deployProbe.error.message);
}

const { data: tableProbe, error: tableErr } = await supabase
  .from("proj_tenant_dashboard_metrics_v1")
  .select("tenant_id,refreshed_at")
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .maybeSingle();
if (tableErr) {
  const missing = /does not exist/i.test(tableErr.message || "");
  if (missing) {
    skip("deploy.dashboard_table", "proj_tenant_dashboard_metrics_v1 not deployed");
    process.exit(0);
  }
  fail("deploy.dashboard_table", tableErr.message);
}
if (!tableProbe) {
  warn("deploy.dashboard_row", "no composite row — run refresh_proj_tenant_dashboard_metrics_v1");
}

const adapterRes = await supabase.rpc("read_tenant_dashboard_v1", {
  p_tenant_id: QA_HQ_TENANT_ID,
});
if (adapterRes.error) fail("adapter.read", adapterRes.error.message);
else pass("adapter.read", "read_tenant_dashboard_v1 OK");

const txRes = await api.getAdminDashboardRead({ force: true });
if (!txRes?.success) fail("transactional.read", txRes?.error || "getAdminDashboardRead failed");
else pass("transactional.read", "getAdminDashboardRead OK");

const adapterPayload =
  adapterRes.data?.data && typeof adapterRes.data.data === "object"
    ? adapterRes.data.data
    : adapterRes.data;
const txPayload = txRes.data || {};

let mismatches = 0;
for (const [path, pick] of SCALAR_PATHS) {
  const av = pick(adapterPayload);
  const tv = pick(txPayload);
  if (withinTolerance(av, tv, path)) {
    pass(`parity.${path}`, `${num(av)} ≈ ${num(tv)}`);
  } else {
    mismatches += 1;
    fail(`parity.${path}`, `adapter=${num(av)} transactional=${num(tv)}`);
  }
}

const adapterTop = adapterPayload?.executive?.topLabsByRevenue || [];
const txTop = txPayload?.executive?.topLabsByRevenue || [];
if (adapterTop.length === txTop.length) {
  pass("parity.executive.topLabsByRevenue.length", String(adapterTop.length));
} else {
  warn(
    "parity.executive.topLabsByRevenue.length",
    `adapter=${adapterTop.length} transactional=${txTop.length}`
  );
}

if (mismatches === 0) {
  pass("dashboard.parity.summary", "all scalar KPIs within tolerance");
} else {
  fail("dashboard.parity.summary", `${mismatches} scalar mismatch(es)`);
}

console.log("\n=== Dashboard parity complete ===\n");
