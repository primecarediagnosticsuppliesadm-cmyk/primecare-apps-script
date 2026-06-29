#!/usr/bin/env node
/**
 * Regression: Add Lab must create labs + ar_credit_control atomically.
 * Validates can_insert_ar_for_lab flips true after lab insert and RPC contract.
 *
 * Usage: node scripts/verify-create-lab-ar-rls.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || QA_HQ_TENANT_ID;

const results = [];
function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
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
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (authErr) throw new Error(`Auth failed: ${authErr.message}`);

  const labId = `RLS-${Date.now().toString(36).slice(-6).toUpperCase()}`;

  const before = await sb.rpc("can_insert_ar_for_lab", {
    target_tenant_id: HQ,
    target_lab_id: labId,
  });
  if (before.data === false) {
    pass("AR-01", "can_insert_ar_for_lab false before lab exists (expected)");
  } else {
    fail("AR-01", `can_insert_ar_for_lab should be false before lab exists; got ${before.data}`);
  }

  const labRow = {
    tenant_id: HQ,
    lab_id: labId,
    lab_name: `RLS Test ${labId}`,
    owner_name: "Regression",
    phone: "5550001111",
    area: "Test",
    credit_terms: "NET30",
    status: "ACTIVE",
  };
  const { error: labErr } = await sb.from("labs").insert([labRow]).select().single();
  if (labErr) {
    fail("AR-02", `labs insert failed: ${labErr.message}`);
  } else {
    pass("AR-02", "labs insert succeeded");
  }

  const mid = await sb.rpc("can_insert_ar_for_lab", {
    target_tenant_id: HQ,
    target_lab_id: labId,
  });
  if (mid.data === true) {
    pass("AR-03", "can_insert_ar_for_lab true after lab insert (RLS-safe existence check)");
  } else {
    fail(
      "AR-03",
      `can_insert_ar_for_lab must be true after lab insert; got ${mid.data}. Apply create_lab_with_ar_credit_rpc.sql`
    );
  }

  const arRow = {
    tenant_id: HQ,
    lab_id: labId,
    lab_name: labRow.lab_name,
    credit_limit: 5000,
    outstanding: 0,
    total_delivered: 0,
    total_paid: 0,
  };
  const { error: arErr } = await sb.from("ar_credit_control").insert([arRow]);
  if (arErr) {
    fail("AR-04", `ar_credit_control insert failed: ${arErr.code} ${arErr.message}`);
  } else {
    pass("AR-04", "ar_credit_control insert succeeded after lab create");
  }

  const rpc = await sb.rpc("create_lab_with_ar_credit", {
    p_tenant_id: HQ,
    p_lab_id: `RPC-${Date.now().toString(36).slice(-5).toUpperCase()}`,
    p_lab_name: "RPC Lab",
    p_owner_name: "Regression",
    p_phone: "5550002222",
    p_area: "Test",
    p_credit_terms: "NET30",
    p_credit_limit: 1000,
    p_collections_notes: "contact_email:rpc@test.com",
    p_status: "ACTIVE",
  });
  if (rpc.error) {
    if (String(rpc.error.message).toLowerCase().includes("schema cache")) {
      fail("AR-05", `create_lab_with_ar_credit RPC missing — apply create_lab_with_ar_credit_rpc.sql`);
    } else {
      fail("AR-05", `create_lab_with_ar_credit failed: ${rpc.error.message}`);
    }
  } else if (rpc.data?.success === true && rpc.data?.lab?.lab_id && rpc.data?.ar?.lab_id) {
    pass("AR-05", "create_lab_with_ar_credit atomic RPC succeeded");
    const rpcLabId = rpc.data.lab.lab_id;
    await sb.from("ar_credit_control").delete().eq("tenant_id", HQ).eq("lab_id", rpcLabId);
    await sb.from("labs").delete().eq("tenant_id", HQ).eq("lab_id", rpcLabId);
  } else {
    fail("AR-05", `create_lab_with_ar_credit unexpected payload: ${JSON.stringify(rpc.data)}`);
  }

  await sb.from("ar_credit_control").delete().eq("tenant_id", HQ).eq("lab_id", labId);
  await sb.from("labs").delete().eq("tenant_id", HQ).eq("lab_id", labId);

  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n=== Create Lab + AR RLS regression ===");
  for (const r of results) {
    console.log(`${r.status} ${r.id}: ${r.detail}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
