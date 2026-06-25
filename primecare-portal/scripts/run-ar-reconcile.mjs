#!/usr/bin/env node
/**
 * Run AR reconciliation RPC (requires SUPABASE_SERVICE_ROLE_KEY in .env.local).
 *
 * Usage:
 *   node scripts/run-ar-reconcile.mjs
 *   TENANT_ID=f168b98f-... node scripts/run-ar-reconcile.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || "f168b98f-47a6-42c3-b788-24c00436fac2";

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
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required in .env.local");
  }

  const sb = createClient(env.VITE_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await sb.rpc("reconcile_ar_from_payments", {
    p_tenant_id: HQ,
  });

  if (error) {
    if (/reconcile_ar_from_payments|function.*does not exist/i.test(error.message || "")) {
      console.error(
        "FAIL: reconcile_ar_from_payments RPC missing — apply supabase/migrations/20260624130000_sprint1_ar_reconcile_rpc.sql"
      );
      process.exit(2);
    }
    throw error;
  }

  console.log("PASS — AR reconcile RPC");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
