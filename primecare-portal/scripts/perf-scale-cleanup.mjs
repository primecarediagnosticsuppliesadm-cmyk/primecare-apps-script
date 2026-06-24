#!/usr/bin/env node
/**
 * Cleanup perf scale tenant data — ISOLATED TENANT ONLY.
 * Never run against Guntur certification tenant.
 *
 * Usage:
 *   node scripts/perf-scale-cleanup.mjs
 *   PERF_TENANT_ID=<uuid> node scripts/perf-scale-cleanup.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const GUNTUR = "787999b9-72f5-4163-a860-551c12ce3414";
const STATE_FILE = resolve(root, ".perf-scale-tenant.json");

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

async function loginExecutive(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "qa.executive@primecare.test",
    password: "1234",
  });
  if (error) throw error;
  return sb;
}

async function deleteBatched(sb, table, tenantId, idColumn, prefix) {
  let total = 0;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select(idColumn)
      .eq("tenant_id", tenantId)
      .like(idColumn, `${prefix}%`)
      .limit(500);
    if (error) throw error;
    if (!data?.length) break;
    const ids = data.map((r) => r[idColumn]);
    const { error: delErr } = await sb.from(table).delete().in(idColumn, ids);
    if (delErr) throw delErr;
    total += ids.length;
    console.log(`  ${table}: deleted ${total}`);
  }
  return total;
}

async function main() {
  const env = loadEnv();
  let tenantId = process.env.PERF_TENANT_ID;
  if (!tenantId && existsSync(STATE_FILE)) {
    tenantId = JSON.parse(readFileSync(STATE_FILE, "utf8")).tenantId;
  }
  if (!tenantId) throw new Error("Set PERF_TENANT_ID or run seed first");
  if (tenantId === GUNTUR) throw new Error("Refusing to cleanup Guntur certification tenant");

  const sb = await loginExecutive(env);
  console.log("Cleaning perf tenant:", tenantId);

  await deleteBatched(sb, "payments", tenantId, "payment_id", "PERF_PAY_");
  await deleteBatched(sb, "orders", tenantId, "order_id", "PERF_ORD_");
  await deleteBatched(sb, "labs", tenantId, "lab_id", "PERF_LAB_");

  const { error: tenantErr } = await sb.from("tenants").delete().eq("id", tenantId);
  if (tenantErr) console.warn("Tenant delete:", tenantErr.message);

  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  console.log("Cleanup complete");
  await sb.auth.signOut();
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
