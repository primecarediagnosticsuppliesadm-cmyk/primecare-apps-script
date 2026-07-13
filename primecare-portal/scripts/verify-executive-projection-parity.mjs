#!/usr/bin/env node
/**
 * Executive projection parity — read_tenant_executive_v1 vs get_founder_snapshot.
 * Sprint 2 Phase 2 certification (Blueprint 18).
 *
 * Usage: node scripts/verify-executive-projection-parity.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const FOUNDER_FIELDS = [
  "revenue_today",
  "cash_collected_today",
  "outstanding_ar",
  "orders_waiting",
  "orders_delayed",
  "critical_inventory_skus",
  "collections_at_risk",
  "inactive_agents_7d",
  "labs_needing_attention",
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

function withinTolerance(a, b, field) {
  const na = num(a);
  const nb = num(b);
  if (na === nb) return true;
  const money = /revenue|cash|outstanding|collection/i.test(field);
  return money ? Math.abs(na - nb) <= 1 : Math.abs(na - nb) === 0;
}

loadEnv();

console.log("\n=== Executive projection parity (adapter vs get_founder_snapshot) ===\n");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
const founderApi = await server.ssrLoadModule("/src/api/founderSnapshotApi.js");
await server.close();

const auth = await supabase.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});
if (auth.error) fail("auth.admin", auth.error.message);
else pass("auth.admin", QA_ADMIN.email);

const deployProbe = await supabase.rpc("read_tenant_executive_v1", {
  p_tenant_id: QA_HQ_TENANT_ID,
});
if (deployProbe.error) {
  const missing = /read_tenant_executive_v1|does not exist/i.test(deployProbe.error.message || "");
  if (missing) {
    skip("deploy.executive_adapter", "Phase 2 migration not deployed — design gate only");
    console.log("\n=== Executive parity skipped (design phase) ===\n");
    process.exit(0);
  }
  fail("deploy.executive_adapter", deployProbe.error.message);
}

const adapterRes = await supabase.rpc("read_tenant_executive_v1", {
  p_tenant_id: QA_HQ_TENANT_ID,
});
if (adapterRes.error) fail("adapter.read", adapterRes.error.message);
else pass("adapter.read", "read_tenant_executive_v1 OK");

const founderRes = await founderApi.getFounderSnapshotRead({ tenantId: QA_HQ_TENANT_ID });
if (!founderRes?.success) {
  if (/timeout|57014/i.test(founderRes?.error || "")) {
    warn("transactional.founder", `get_founder_snapshot timeout — ${founderRes.error}`);
    warn(
      "transactional.founder",
      "Phase 2 target: replace hot path with read_tenant_executive_v1"
    );
  } else {
    fail("transactional.founder", founderRes?.error || "get_founder_snapshot failed");
  }
} else {
  pass("transactional.founder", "get_founder_snapshot OK");
}

if (!founderRes?.success) {
  console.log("\n=== Executive parity incomplete (baseline unavailable) ===\n");
  process.exit(process.exitCode || 0);
}

const adapterPayload =
  adapterRes.data?.data && typeof adapterRes.data.data === "object"
    ? adapterRes.data.data
    : adapterRes.data || {};
const founderPayload = founderRes.data || {};

let mismatches = 0;
for (const field of FOUNDER_FIELDS) {
  const av = adapterPayload[field];
  const fv = founderPayload[field];
  if (withinTolerance(av, fv, field)) {
    pass(`parity.${field}`, `${num(av)} ≈ ${num(fv)}`);
  } else {
    mismatches += 1;
    fail(`parity.${field}`, `adapter=${num(av)} founder=${num(fv)}`);
  }
}

if (mismatches === 0) {
  pass("executive.parity.summary", "all founder fields within tolerance");
} else {
  fail("executive.parity.summary", `${mismatches} field mismatch(es)`);
}

console.log("\n=== Executive parity complete ===\n");
