#!/usr/bin/env node
/**
 * Verify AR reconciliation state (read-only).
 *
 * This verifier must never call reconcile/repair RPCs. Use
 * `repair-ar-reconcile.mjs --apply` for the mutation-capable path.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res.status ?? 1;
}

console.log("VERIFY-ONLY: AR reconcile mutation skipped. Use repair-ar-reconcile.mjs --apply for repairs.");

const auditStatus = run("node", ["scripts/verify-collection-inconsistencies.mjs"]);
process.exit(auditStatus);
