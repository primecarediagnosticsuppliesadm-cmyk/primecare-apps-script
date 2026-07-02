#!/usr/bin/env node
/**
 * Rebuild QA tenant projection cascade (Phase 1 core + Phase 2 metrics/composites).
 * Usage: node scripts/rebuild-sprint2-phase2-projections.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const REGISTRY_CASCADE = [
  "PRJ-ORD-ORDER-v1",
  "PRJ-COL-LAB-v1",
  "PRJ-DSH-METRICS-v1",
  "PRJ-EXE-METRICS-v1",
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

async function main() {
  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  console.log("\n=== Rebuild Sprint 2 Phase 2 projections ===\n");
  console.log(`Tenant: ${QA_HQ_TENANT_ID}\n`);

  const auth = await sb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (auth.error) {
    console.error(`FAIL  auth.admin — ${auth.error.message}`);
    process.exit(1);
  }
  console.log(`PASS  auth.admin — ${QA_ADMIN.email}`);

  for (const registryId of REGISTRY_CASCADE) {
    const t0 = performance.now();
    const { data, error } = await sb.rpc("rebuild_projection_v1", {
      p_tenant_id: QA_HQ_TENANT_ID,
      p_registry_id: registryId,
      p_days_back: 90,
    });
    const ms = Math.round(performance.now() - t0);
    if (error) {
      console.error(`FAIL  rebuild.${registryId} — ${error.message} (${ms}ms)`);
      process.exitCode = 1;
      continue;
    }
    const rowCount = data?.row_count ?? data?.rowCount ?? "—";
    console.log(`PASS  rebuild.${registryId} — rows=${rowCount} (${ms}ms)`);
  }

  const { data: metaRows } = await sb
    .from("hq_projection_meta_v1")
    .select("registry_id,as_of,row_count,last_error")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .in("registry_id", [
      "PRJ-ORD-ORDER-v1",
      "PRJ-COL-LAB-v1",
      "PRJ-ORD-METRICS-v1",
      "PRJ-COL-METRICS-v1",
      "PRJ-DSH-METRICS-v1",
      "PRJ-EXE-METRICS-v1",
    ]);

  console.log("\nMeta rows:");
  for (const row of metaRows || []) {
    const err = row.last_error ? ` ERROR=${row.last_error}` : "";
    console.log(`  ${row.registry_id}: rows=${row.row_count} as_of=${row.as_of}${err}`);
  }

  console.log("\n=== Rebuild complete ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
