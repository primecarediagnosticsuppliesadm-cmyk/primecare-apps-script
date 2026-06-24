#!/usr/bin/env node
/**
 * Performance scale seed — ISOLATED TENANT ONLY.
 * Never run against Guntur certification tenant (787999b9-72f5-4163-a860-551c12ce3414).
 *
 * Creates a dedicated perf tenant + batched seed data.
 * Requires executive session (.env.local).
 *
 * Usage:
 *   PERF_TENANT_NAME="Perf Scale Tenant" node scripts/perf-scale-seed.mjs
 *   PERF_LABS=1000 PERF_AGENTS=1000 PERF_ORDERS=100000 node scripts/perf-scale-seed.mjs --dry-run
 *
 * Env:
 *   PERF_TENANT_ID       — reuse existing perf tenant (skip tenant create)
 *   PERF_LABS            — default 1000
 *   PERF_AGENTS          — default 1000 (profiles must exist or use PERF_AGENT_PREFIX batch create via executive)
 *   PERF_ORDERS          — default 100000
 *   PERF_PAYMENTS        — default matches PERF_ORDERS
 *   PERF_BATCH           — insert batch size (default 500)
 *   PERF_DRY_RUN         — set 1 to print plan only
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const GUNTUR = "787999b9-72f5-4163-a860-551c12ce3414";
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";
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

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function loginExecutive(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qa.executive@primecare.test",
    password: "1234",
  });
  if (error) throw error;
  return sb;
}

async function batchInsert(sb, table, rows, batchSize) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(chunk);
    if (error) throw new Error(`${table} batch @${i}: ${error.message}`);
    inserted += chunk.length;
    if (inserted % (batchSize * 10) === 0) {
      console.log(`  ${table}: ${inserted}/${rows.length}`);
    }
  }
  return inserted;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.PERF_DRY_RUN === "1";
  const env = loadEnv();
  const labs = num(process.env.PERF_LABS, 1000);
  const agents = num(process.env.PERF_AGENTS, 1000);
  const orders = num(process.env.PERF_ORDERS, 100000);
  const payments = num(process.env.PERF_PAYMENTS, orders);
  const batchSize = num(process.env.PERF_BATCH, 500);
  let tenantId = process.env.PERF_TENANT_ID || null;

  console.log("Perf scale seed plan:", { labs, agents, orders, payments, batchSize, dryRun });

  if (tenantId === GUNTUR) {
    throw new Error("Refusing to seed Guntur certification tenant");
  }

  if (dryRun) {
    console.log("Dry run — no writes.");
    return;
  }

  const sb = await loginExecutive(env);

  if (!tenantId) {
    const name = process.env.PERF_TENANT_NAME || `Perf Scale ${Date.now().toString(36)}`;
    const tenantCode = `perf-${Date.now().toString(36)}`;
    const { data, error } = await sb
      .from("tenants")
      .insert([{ tenant_name: name, tenant_code: tenantCode, status: "ACTIVE" }])
      .select("id,tenant_name")
      .single();
    if (error) throw error;
    tenantId = data.id;
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ tenantId, name: data.tenant_name, createdAt: new Date().toISOString() }, null, 2)
    );
    console.log("Created perf tenant:", tenantId, data.tenant_name);
  } else if (tenantId === GUNTUR) {
    throw new Error("Refusing to seed Guntur certification tenant");
  }

  const agentIds = Array.from({ length: agents }, (_, i) => `PERF_AGENT_${String(i + 1).padStart(5, "0")}`);
  const labRows = Array.from({ length: labs }, (_, i) => {
    const labId = `PERF_LAB_${String(i + 1).padStart(6, "0")}`;
    const agentId = agentIds[i % agentIds.length];
    return {
      tenant_id: tenantId,
      lab_id: labId,
      lab_name: `Perf Lab ${i + 1}`,
      owner_name: "Perf Owner",
      phone: "9000000000",
      area: "Perf",
      credit_terms: "Net 30",
      status: "ACTIVE",
      assigned_agent_id: agentId,
      agent_id: agentId,
    };
  });

  console.log(`Inserting ${labs} labs...`);
  await batchInsert(sb, "labs", labRows, batchSize);

  const orderRows = Array.from({ length: orders }, (_, i) => {
    const lab = labRows[i % labRows.length];
    return {
      order_id: `PERF_ORD_${String(i + 1).padStart(8, "0")}`,
      tenant_id: tenantId,
      lab_id: lab.lab_id,
      order_date: "2026-01-15",
      status: i % 3 === 0 ? "Fulfilled" : "Placed",
      total_amount: 500 + (i % 100),
      created_by: "perf-scale-seed",
    };
  });

  console.log(`Inserting ${orders} orders...`);
  await batchInsert(sb, "orders", orderRows, batchSize);

  const paymentRows = Array.from({ length: payments }, (_, i) => {
    const ord = orderRows[i % orderRows.length];
    return {
      payment_id: `PERF_PAY_${String(i + 1).padStart(8, "0")}`,
      tenant_id: tenantId,
      lab_id: ord.lab_id,
      order_id: ord.order_id,
      amount_received: ord.total_amount,
      payment_date: "2026-01-20",
      mode: "Cash",
    };
  });

  console.log(`Inserting ${payments} payments...`);
  await batchInsert(sb, "payments", paymentRows, batchSize);

  console.log("Done. State:", STATE_FILE);
  await sb.auth.signOut();
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
