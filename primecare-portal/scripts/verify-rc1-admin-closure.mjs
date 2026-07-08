#!/usr/bin/env node
/**
 * RC1 admin closure — create lab RPC, reset password, payment recording wiring.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { QA_ADMIN, QA_AGENT, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { loadEnvLocal } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}  ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}  ${msg}`);
  failures += 1;
}

function runNode(script, args = []) {
  const r = spawnSync("node", [resolve(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}` };
}

async function main() {
  console.log("\n=== RC1 Admin Closure ===\n");
  const env = loadEnvLocal();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (authErr) fail("ADM-01", `admin login: ${authErr.message}`);
  else pass("ADM-01", "admin login");

  const labsPage = readFileSync(resolve(root, "src/pages/LabsPage.jsx"), "utf8");
  if (/createLabWrite/.test(labsPage)) {
    pass("ADM-02", "create lab UI wired (LabsPage)");
  } else {
    fail("ADM-02", "create lab UI not found");
  }

  const orders = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
  const collections = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
  if (/Record Payment/.test(orders) && /Record Payment/.test(collections)) {
    pass("ADM-06", "Record Payment on Orders + Collections/Credit");
  } else {
    fail("ADM-06", "Record Payment UI missing");
  }

  const createLab = runNode("verify-create-lab-ar-rls.mjs", ["--apply"]);
  if (createLab.ok) pass("ADM-03", "create_lab_with_ar_credit RPC (--apply)");
  else fail("ADM-03", `create lab RPC: ${createLab.out.slice(-300)}`);

  const { data: adminSession } = await sb.auth.getSession();
  const token = adminSession?.session?.access_token;
  if (token) {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/reset-platform-user-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ tenantId: QA_HQ_TENANT_ID, email: QA_AGENT.email }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.data?.temporaryPassword) {
      pass("ADM-04", "reset-platform-user-password returns temp password");
      const retry = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      }).auth.signInWithPassword({
        email: QA_AGENT.email,
        password: body.data.temporaryPassword,
      });
      if (!retry.error) pass("ADM-05", "agent login with reset password");
      else fail("ADM-05", retry.error.message);
    } else {
      fail("ADM-04", body?.error || `reset HTTP ${res.status}`);
    }
  }

  const golden = runNode("verify-primecare-production-golden-path.mjs");
  if (golden.ok) pass("ADM-07", "payment recording golden path");
  else fail("ADM-07", "golden path failed");

  const partial = runNode("verify-partial-payment-sync.mjs");
  if (partial.ok) pass("ADM-08", "partial payment strict lifecycle");
  else fail("ADM-08", `partial payment: ${partial.out.slice(-200)}`);

  console.log(`\nSummary: FAIL=${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
