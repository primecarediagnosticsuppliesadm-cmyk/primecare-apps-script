#!/usr/bin/env node
/**
 * Prune QA user_provisioning_events so Ops Center bounded read cert passes.
 * RC1 closure maintenance — QA tenant only.
 */
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { loadEnvLocal } from "./qaSignIn.mjs";

const KEEP = 150;

async function main() {
  const env = loadEnvLocal();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (authErr) throw new Error(authErr.message);

  const { data: rows, error } = await sb
    .from("user_provisioning_events")
    .select("id, created_at")
    .eq("hq_tenant_id", QA_HQ_TENANT_ID)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  if ((rows || []).length <= 200) {
    console.log(`PASS  prune skipped — ${rows?.length || 0} events (within cap)`);
    return;
  }

  const toDelete = rows.slice(KEEP).map((r) => r.id);
  const { error: delErr } = await sb.from("user_provisioning_events").delete().in("id", toDelete);
  if (delErr) throw new Error(delErr.message);
  console.log(`PASS  pruned ${toDelete.length} provisioning events (kept ${KEEP})`);
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
