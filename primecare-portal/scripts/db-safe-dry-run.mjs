#!/usr/bin/env node
/**
 * Safe Supabase dry-run wrapper with environment identity guard.
 *
 * Usage:
 *   node scripts/db-safe-dry-run.mjs --expect=qa
 *   PRIMECARE_CONFIRM_PROD=YES node scripts/db-safe-dry-run.mjs --expect=prod
 *
 * Never runs `db push` without --dry-run. Production requires PRIMECARE_CONFIRM_PROD=YES.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

const expect = String(argValue("--expect") || "").toLowerCase();
if (expect !== "qa" && expect !== "prod" && expect !== "production") {
  console.error("Usage: node scripts/db-safe-dry-run.mjs --expect=qa|prod");
  process.exit(1);
}

const expectNorm = expect === "production" ? "prod" : expect;
if (expectNorm === "prod") {
  if (String(process.env.PRIMECARE_CONFIRM_PROD || "").trim() !== "YES") {
    console.error("FAIL  Production dry-run requires PRIMECARE_CONFIRM_PROD=YES");
    process.exit(1);
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: opts.stdio || "inherit",
    env: process.env,
  });
  return r.status ?? 1;
}

const assertStatus = run("node", [
  resolve(root, "scripts/assert-supabase-environment.mjs"),
  `--expect=${expectNorm}`,
]);
if (assertStatus !== 0) process.exit(assertStatus);

console.log("\n--- supabase migration list ---\n");
const listStatus = run("supabase", ["migration", "list"]);
if (listStatus !== 0) process.exit(listStatus);

console.log("\n--- supabase db push --dry-run ---\n");
const dryStatus = run("supabase", ["db", "push", "--dry-run"]);
process.exit(dryStatus);
