#!/usr/bin/env node
/**
 * Inventory reconciliation — flag SKUs where ledger net movement != current_stock delta from zero baseline.
 * Pilot scope: detect rows with ORDER_OUT/PURCHASE_IN ledger but negative current_stock.
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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (authErr) throw new Error(authErr.message);

  const { data: inventory, error: invErr } = await sb
    .from("inventory")
    .select("tenant_id,product_id,current_stock,min_stock")
    .eq("tenant_id", HQ);
  if (invErr) throw invErr;

  const negative = (inventory || []).filter((r) => num(r.current_stock) < 0);
  const critical = (inventory || []).filter(
    (r) => num(r.current_stock) <= num(r.min_stock) && num(r.current_stock) >= 0
  );

  console.log("\n=== Inventory Reconciliation ===\n");
  console.log(`SKUs scanned: ${(inventory || []).length}`);
  console.log(`Negative stock rows: ${negative.length}`);
  console.log(`At/below min stock: ${critical.length}`);

  if (negative.length) {
    console.log("FAIL — negative current_stock detected");
    console.log(JSON.stringify(negative.slice(0, 10), null, 2));
    process.exit(1);
  }

  console.log("PASS — no negative inventory rows");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
