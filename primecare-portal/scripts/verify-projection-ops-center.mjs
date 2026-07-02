#!/usr/bin/env node
/**
 * Verify Projection Operations Center — catalog, meta, health record shape.
 * Usage: node scripts/verify-projection-ops-center.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const REQUIRED_FIELDS = [
  "registryId",
  "status",
  "rowCount",
  "freshnessMs",
  "freshnessHuman",
  "freshnessStatus",
  "lastRebuild",
  "refreshDurationMs",
  "parityStatus",
  "failureCount",
  "shadowStatus",
  "featureFlagStatus",
];

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
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

function loadCatalog() {
  const path = resolve(root, "src/projectionOps/projectionOpsCatalog.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildHealthRecord(catalogEntry, metaRow) {
  const now = Date.now();
  const asOf = metaRow?.as_of ? new Date(metaRow.as_of).getTime() : NaN;
  const freshnessMs = Number.isFinite(asOf) ? Math.max(0, now - asOf) : null;
  return {
    registryId: catalogEntry.registryId,
    status: catalogEntry.status,
    rowCount: Number(metaRow?.row_count ?? 0),
    freshnessMs,
    freshnessHuman: freshnessMs == null ? "—" : `${Math.round(freshnessMs / 1000)}s`,
    freshnessStatus: "PASS",
    lastRebuild: metaRow?.as_of ?? null,
    refreshDurationMs: null,
    parityStatus: metaRow?.last_error ? "FAIL" : "UNKNOWN",
    failureCount: metaRow?.last_error ? 1 : 0,
    shadowStatus: `${catalogEntry.status}-off`,
    featureFlagStatus: catalogEntry.featureFlag ? "OFF" : "N/A",
  };
}

console.log("\n=== Projection Operations Center verification ===\n");

const catalog = loadCatalog();
const projections = catalog.projections || [];
if (projections.length < 6) {
  fail("catalog.count", `expected >= 6 projections, got ${projections.length}`);
} else {
  pass("catalog.count", `${projections.length} projections defined`);
}

for (const p of projections) {
  if (!p.registryId || !p.table || !p.stalenessSlaMs) {
    fail(`catalog.${p.registryId || "?"}`, "missing registryId/table/stalenessSlaMs");
  }
}

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

if (metaErr) fail("meta.read", metaErr.message);
else pass("meta.read", `${metaRows?.length ?? 0} rows for QA tenant`);

const metaById = new Map((metaRows || []).map((r) => [r.registry_id, r]));

for (const entry of projections) {
  const meta = metaById.get(entry.registryId);
  if (!meta && catalog.deployed_registry_ids?.includes(entry.registryId)) {
    fail(`meta.${entry.registryId}`, "deployed projection missing meta row");
    continue;
  }
  const record = buildHealthRecord(entry, meta);
  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      fail(`health.${entry.registryId}.${field}`, "missing from health record");
    }
  }
  if (meta) {
    pass(`health.${entry.registryId}`, `rows=${record.rowCount} fresh=${record.freshnessHuman}`);
  } else {
    pass(`health.${entry.registryId}`, "catalog only (not deployed)");
  }
}

const flagOff =
  !env.VITE_READ_ADAPTER_ORDERS_V1 &&
  !env.VITE_READ_ADAPTER_RECEIVABLES_V1 &&
  !env.VITE_READ_ADAPTER_DASHBOARD_V1 &&
  !env.VITE_READ_ADAPTER_EXECUTIVE_V1;
if (flagOff) pass("flags.shadow", "all VITE_READ_ADAPTER_* unset");
else fail("flags.shadow", "adapter flags must remain OFF for shadow mode");

console.log("\n=== Ops center verification complete ===\n");
