#!/usr/bin/env node
/**
 * Fast QA vs Prod RLS parity probe (no supabase CLI / psql).
 * Usage: node scripts/audit-rls-parity-fast.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const PROD_URL = "https://alxhrnotnvwpblsiadxj.supabase.co";
const PROD_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseGhybm90bnZ3cGJsc2lhZHhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MTc0NDIsImV4cCI6MjA5ODA5MzQ0Mn0.9SokJ2cn1YD-lgbSFFGCERAwX8HRo2r0IStJSmBmXUk";

function loadQaEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

async function login(sb, email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed ${email}: ${error.message}`);
}

async function probeRpc(sb, name, args) {
  const { data, error } = await sb.rpc(name, args);
  return { data, error: error?.message ?? null, code: error?.code ?? null };
}

async function probeLabCreate(sb, tenantId, label) {
  const labId = `AUDIT-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const labRow = {
    tenant_id: tenantId,
    lab_id: labId,
    lab_name: `RLS Audit ${labId}`,
    owner_name: "Audit",
    phone: "000",
    area: "Audit",
    credit_terms: "NET30",
    status: "ACTIVE",
  };
  const { data: lab, error: labErr } = await sb.from("labs").insert([labRow]).select().single();
  const labStatus = labErr ? `FAIL ${labErr.code}: ${labErr.message}` : "201 OK";

  let arStatus = "skipped (lab failed)";
  if (!labErr && lab) {
    const arRow = {
      tenant_id: tenantId,
      lab_id: labId,
      lab_name: labRow.lab_name,
      credit_limit: 1000,
      outstanding: 0,
      total_delivered: 0,
      total_paid: 0,
    };
    const { error: arErr } = await sb.from("ar_credit_control").insert([arRow]);
    arStatus = arErr ? `FAIL ${arErr.code}: ${arErr.message}` : "201 OK";
    await sb.from("ar_credit_control").delete().eq("tenant_id", tenantId).eq("lab_id", labId);
  }
  if (!labErr) {
    await sb.from("labs").delete().eq("tenant_id", tenantId).eq("lab_id", labId);
  }

  const canLab = await probeRpc(sb, "can_insert_lab_for_tenant", { target_tenant_id: tenantId });
  const canAr = await probeRpc(sb, "can_insert_ar_for_lab", {
    target_tenant_id: tenantId,
    target_lab_id: labId,
  });

  return {
    label,
    labId,
    labInsert: labStatus,
    arInsert: arStatus,
    can_insert_lab_for_tenant: canLab,
    can_insert_ar_for_lab: canAr,
  };
}

async function main() {
  const qaEnv = loadQaEnv();
  const qaSb = createClient(qaEnv.VITE_SUPABASE_URL, qaEnv.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await login(qaSb, QA_ADMIN.email, QA_ADMIN.password);

  const prodSb = createClient(PROD_URL, PROD_ANON, { auth: { persistSession: false } });

  console.log("=== RPC existence (unauthenticated) ===");
  for (const [label, sb] of [
    ["QA", qaSb],
    ["PROD", prodSb],
  ]) {
    for (const fn of ["can_insert_lab_for_tenant", "can_insert_ar_for_lab"]) {
      const r = await probeRpc(sb, fn, {
        target_tenant_id: QA_HQ_TENANT_ID,
        target_lab_id: "PROBE",
      });
      console.log(`${label} ${fn}:`, r.error ?? `data=${JSON.stringify(r.data)}`);
    }
  }

  console.log("\n=== QA admin lab+AR create probe ===");
  const qaResult = await probeLabCreate(qaSb, QA_HQ_TENANT_ID, "QA");
  console.log(JSON.stringify(qaResult, null, 2));

  console.log("\n=== PROD admin login probe ===");
  const { error: prodAuthErr } = await prodSb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (prodAuthErr) {
    console.log(`PROD QA admin login: ${prodAuthErr.message} (expected — use prod admin manually)`);
  } else {
    console.log("PROD QA admin login succeeded unexpectedly");
    const prodTenant = process.env.PROD_TENANT_ID;
    if (prodTenant) {
      const prodResult = await probeLabCreate(prodSb, prodTenant, "PROD");
      console.log(JSON.stringify(prodResult, null, 2));
    }
  }

  console.log("\n=== OpenAPI RPC list (prod, anon) ===");
  const res = await fetch(`${PROD_URL}/rest/v1/`, {
    headers: { apikey: PROD_ANON, Authorization: `Bearer ${PROD_ANON}` },
  });
  const openapi = await res.json();
  const paths = Object.keys(openapi.paths || {}).filter((p) => p.includes("rpc"));
  const rpcHits = paths.filter((p) =>
    ["can_insert", "current_profile", "tenant_id_matches", "lab_is_visible"].some((k) =>
      p.includes(k)
    )
  );
  console.log("Prod RPC paths (subset):", rpcHits.sort().join(", ") || "(none matched)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
