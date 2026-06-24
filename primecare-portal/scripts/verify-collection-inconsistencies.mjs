#!/usr/bin/env node
/**
 * Classify collection dual-ledger inconsistencies (RC-2 financial recon evidence).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";

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
  const { error } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(error.message);

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });
  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const { data: session } = await sb.auth.getSession();
  if (supabase && session?.session) {
    await supabase.auth.setSession({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    });
  }
  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");

  const { data: arRaw } = await sb.from("ar_credit_control").select("*").eq("tenant_id", HQ);
  const { data: payRaw } = await sb.from("payments").select("*").eq("tenant_id", HQ);
  const collRes = await api.getCollectionsRead({ tenantId: HQ });
  const collections = collRes?.data?.collections || collRes?.data || [];
  const issues = api.auditCollectionDataInconsistencies(arRaw, payRaw, collections);

  const byType = {};
  for (const i of issues) {
    byType[i.type] = (byType[i.type] || 0) + 1;
  }

  const perfLabs = (collections || []).filter((c) => /PERF_/i.test(String(c.labId || c.lab_id)));
  const goldenLabs = (collections || []).filter((c) => /QA_LAB/i.test(String(c.labId || c.lab_id)));

  console.log("\n=== Collection Inconsistency Classification ===\n");
  console.log(`Total issues: ${issues.length}`);
  console.log("By type:", JSON.stringify(byType, null, 2));
  console.log(`PERF lab rows in collections read: ${perfLabs.length}`);
  console.log(`QA golden lab rows: ${goldenLabs.length}`);

  const legacyTypes = new Set([
    "ar_total_paid_below_payments_sum",
    "payments_without_ar_row",
    "pending_with_no_outstanding_but_payments",
    "paid_status_zero_total_paid",
  ]);
  const legacyCount = issues.filter((i) => legacyTypes.has(i.type)).length;
  const classification =
    perfLabs.length > 0 && legacyCount === issues.length
      ? "MIGRATION_ARTIFACT_PERF_TENANT_POLLUTION"
      : legacyCount === issues.length
        ? "HISTORICAL_DUAL_LEDGER_DRIFT"
        : "MIXED";

  console.log(`\nClassification: ${classification}`);
  console.log(`Legacy drift issues: ${legacyCount}/${issues.length}`);
  console.log(
    "\nRecommendation: Accept legacy drift for first paying lab if golden-path labs (QA_LAB_*) have zero issues; schedule AR backfill for pre-invoice payments."
  );

  await server?.close?.();
  process.exit(issues.some((i) => /QA_LAB_001/i.test(String(i.labId))) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
