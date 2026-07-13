#!/usr/bin/env node
/**
 * Repair AR from payments.
 *
 * Dry-run by default. Mutation requires either:
 *   node scripts/repair-ar-reconcile.mjs --apply
 *   CONFIRM_MUTATION=true node scripts/repair-ar-reconcile.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || "f168b98f-47a6-42c3-b788-24c00436fac2";
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";

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

async function loginAdminClient(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Admin login failed: ${error.message}`);
  return sb;
}

async function summarizeArState(sb) {
  const [ar, payments] = await Promise.all([
    sb
      .from("ar_credit_control")
      .select("lab_id,outstanding,total_paid,total_delivered")
      .eq("tenant_id", HQ),
    sb
      .from("payments")
      .select("payment_id,lab_id,amount_received")
      .eq("tenant_id", HQ),
  ]);
  if (ar.error) throw new Error(`ar_credit_control read failed: ${ar.error.message}`);
  if (payments.error) throw new Error(`payments read failed: ${payments.error.message}`);
  const arRows = ar.data || [];
  const paymentRows = payments.data || [];
  const zeroActivityRows = arRows.filter(
    (row) =>
      Number(row.outstanding || 0) === 0 &&
      Number(row.total_paid || 0) === 0 &&
      Number(row.total_delivered || 0) === 0
  ).length;
  return {
    tenant_id: HQ,
    ar_rows: arRows.length,
    payment_rows: paymentRows.length,
    zero_activity_ar_rows: zeroActivityRows,
  };
}

async function main() {
  const env = loadEnv();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required in .env.local");

  console.log(`Tenant target: ${HQ}`);
  if (!APPLY) {
    const dryClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    await dryClient.auth.signInWithPassword({
      email: "qa.admin@primecare.test",
      password: "1234",
    });
    const summary = await summarizeArState(dryClient);
    console.log("DRY-RUN — no AR rows mutated. Re-run with --apply to call reconcile_ar_from_payments.");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const serviceClient = createClient(env.VITE_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  let client = serviceClient;
  let authMode = "service_role";
  let { data, error } = await client.rpc("reconcile_ar_from_payments", {
    p_tenant_id: HQ,
  });

  if (error?.message === "tenant_mismatch") {
    console.warn(
      "WARN: service_role hit tenant_mismatch — apply supabase/sql/sprint1_ar_reconcile_service_role_fix.sql"
    );
    console.warn("Falling back to qa.admin JWT session for reconcile.");
    client = await loginAdminClient(env);
    authMode = "admin_jwt";
    ({ data, error } = await client.rpc("reconcile_ar_from_payments", {
      p_tenant_id: HQ,
    }));
  }

  if (error) {
    if (/reconcile_ar_from_payments|function.*does not exist/i.test(error.message || "")) {
      console.error(
        "FAIL: reconcile_ar_from_payments RPC missing — apply supabase/migrations/20260624130000_sprint1_ar_reconcile_rpc.sql"
      );
      process.exit(2);
    }
    throw error;
  }

  console.log(`PASS — AR reconcile RPC (${authMode})`);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
