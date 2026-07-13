#!/usr/bin/env node
/**
 * Run AR reconciliation RPC (requires SUPABASE_SERVICE_ROLE_KEY in .env.local).
 * Deprecated compatibility wrapper. Prefer repair-ar-reconcile.mjs.
 *
 * Usage:
 *   node scripts/run-ar-reconcile.mjs --apply
 *   CONFIRM_MUTATION=true TENANT_ID=f168b98f-... node scripts/run-ar-reconcile.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = ["scripts/repair-ar-reconcile.mjs", ...process.argv.slice(2)];
const result = spawnSync("node", args, {
  cwd: root,
  encoding: "utf8",
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
