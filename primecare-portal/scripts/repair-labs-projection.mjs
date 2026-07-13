#!/usr/bin/env node
/**
 * Repair/rebuild Sprint 8A Labs projections.
 *
 * Dry-run by default. Mutates projection tables only when called with --apply
 * or CONFIRM_MUTATION=true.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { QA_EXECUTIVE, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";
const REGISTRY_IDS = ["PRJ-COL-LAB-v1", "PRJ-LAB-PROFILE-v1"];

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}
function str(v) {
  return String(v ?? "").trim();
}
function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      })
  );
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");

  console.log("\n=== Labs projection repair ===\n");
  if (!APPLY) {
    pass("mode.dry_run", "no rebuilds executed; rerun with --apply or CONFIRM_MUTATION=true");
    console.log(`Would rebuild ${REGISTRY_IDS.join(", ")} for QA HQ and executive-visible tenants.`);
    return;
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const auth = await signInWithQaCredentials(client, QA_EXECUTIVE);
  if (!auth.ok) {
    fail("auth.executive", auth.error || "sign-in failed");
    return;
  }
  pass("auth.executive", auth.email);

  const { data: legacyRows, error: legacyError } = await client
    .from("v_labs_credit")
    .select("tenant_id")
    .limit(5000);
  if (legacyError) {
    fail("tenants.visible", legacyError.message || String(legacyError));
    return;
  }

  const tenantIds = [
    ...new Set([
      QA_HQ_TENANT_ID,
      ...(legacyRows || []).map((row) => str(row.tenant_id)).filter(Boolean),
    ]),
  ];
  pass("tenants.visible", `${tenantIds.length} tenant(s)`);

  for (const tenantId of tenantIds) {
    for (const registryId of REGISTRY_IDS) {
      const { data, error } = await client.rpc("rebuild_projection_v1", {
        p_tenant_id: tenantId,
        p_registry_id: registryId,
        p_days_back: 90,
      });
      if (error) {
        fail(`rebuild.${registryId}.${tenantId}`, error.message || String(error));
      } else {
        pass(`rebuild.${registryId}.${tenantId}`, `${data?.row_count ?? "?"} rows`);
      }
    }
  }
}

await main();

if (process.exitCode) process.exit(process.exitCode);
