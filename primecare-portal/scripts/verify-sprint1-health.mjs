#!/usr/bin/env node
/**
 * Sprint 1 health — bounded reads + optional RPC presence (service role).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return {};
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

function run(script) {
  const res = spawnSync("node", [resolve(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res.status ?? 1;
}

async function checkRpcs(env) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !env.VITE_SUPABASE_URL) {
    console.log("WARN — SUPABASE_SERVICE_ROLE_KEY missing; skipping RPC deploy check");
    return 0;
  }
  const sb = createClient(env.VITE_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
  const names = [
    "reconcile_ar_from_payments",
    "post_collection_payment",
    "deduct_inventory_for_order",
    "create_lab_order",
    "get_founder_snapshot",
  ];
  let missing = 0;
  for (const name of names) {
    const probe =
      name === "reconcile_ar_from_payments"
        ? sb.rpc(name, { p_tenant_id: "f168b98f-47a6-42c3-b788-24c00436fac2" })
        : name === "get_founder_snapshot"
          ? sb.rpc(name, { p_tenant_id: "f168b98f-47a6-42c3-b788-24c00436fac2" })
          : null;
    if (!probe) continue;
    const { error } = await probe;
    if (error && /does not exist/i.test(error.message || "")) {
      console.log(`FAIL — RPC missing: ${name}`);
      missing += 1;
    } else {
      console.log(`PASS — RPC present: ${name}`);
    }
  }
  return missing > 0 ? 1 : 0;
}

async function main() {
  const env = loadEnv();
  const bounded = run("verify-bounded-reads.mjs");
  if (bounded !== 0) process.exit(bounded);
  const rpcStatus = await checkRpcs(env);
  process.exit(rpcStatus);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
