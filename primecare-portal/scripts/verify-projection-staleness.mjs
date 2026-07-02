#!/usr/bin/env node
/**
 * Projection staleness — hq_projection_meta_v1 vs registry SLA.
 * Usage: node scripts/verify-projection-staleness.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SLA_MS = {
  "PRJ-ORD-ORDER-v1": 60_000,
  "PRJ-COL-LAB-v1": 60_000,
  "PRJ-ORD-METRICS-v1": 90_000,
  "PRJ-COL-METRICS-v1": 90_000,
  "PRJ-DSH-METRICS-v1": 90_000,
  "PRJ-EXE-METRICS-v1": 180_000,
};

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
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

console.log("\n=== Projection staleness certification ===\n");

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const auth = await sb.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});
if (auth.error) fail("auth.admin", auth.error.message);
else pass("auth.admin", QA_ADMIN.email);

const { data: metaRows, error: metaErr } = await sb
  .from("hq_projection_meta_v1")
  .select("registry_id,as_of,row_count,last_error,updated_at")
  .eq("tenant_id", QA_HQ_TENANT_ID);

if (metaErr) {
  if (metaErr.message?.includes("does not exist")) {
    fail("deploy.meta", "hq_projection_meta_v1 not deployed");
    process.exit(1);
  }
  fail("meta.read", metaErr.message);
}

const byRegistry = new Map((metaRows || []).map((r) => [r.registry_id, r]));
const now = Date.now();

for (const [registryId, slaMs] of Object.entries(SLA_MS)) {
  const row = byRegistry.get(registryId);
  if (!row?.as_of) {
    warn(`${registryId}.freshness`, "no meta row — run rebuild_projection_v1");
    continue;
  }
  const ageMs = now - new Date(row.as_of).getTime();
  if (row.last_error) {
    fail(`${registryId}.error`, row.last_error);
  } else if (ageMs > slaMs) {
    fail(`${registryId}.staleness`, `${Math.round(ageMs / 1000)}s > SLA ${slaMs / 1000}s`);
  } else {
    pass(
      `${registryId}.staleness`,
      `${Math.round(ageMs / 1000)}s (rows=${row.row_count ?? 0})`
    );
  }
}

const { data: orderFresh, error: ordErr } = await sb
  .from("proj_order_v1")
  .select("refreshed_at")
  .order("refreshed_at", { ascending: false })
  .limit(1);
if (ordErr) {
  fail("proj_order_v1.read", ordErr.message);
} else if (orderFresh?.[0]?.refreshed_at) {
  pass("proj_order_v1.max_refreshed", orderFresh[0].refreshed_at);
} else {
  warn("proj_order_v1.empty", "no projection rows — run rebuild");
}

const { data: recvFresh, error: recvErr } = await sb
  .from("proj_lab_receivable_v1")
  .select("refreshed_at")
  .order("refreshed_at", { ascending: false })
  .limit(1);
if (recvErr) {
  fail("proj_lab_receivable_v1.read", recvErr.message);
} else if (recvFresh?.[0]?.refreshed_at) {
  pass("proj_lab_receivable_v1.max_refreshed", recvFresh[0].refreshed_at);
} else {
  warn("proj_lab_receivable_v1.empty", "no projection rows — run rebuild");
}

console.log("\n=== Staleness certification complete ===\n");
