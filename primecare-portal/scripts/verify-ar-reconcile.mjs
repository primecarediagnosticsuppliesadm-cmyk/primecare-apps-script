#!/usr/bin/env node
/**
 * Verify AR reconciliation: run reconcile RPC then collection inconsistency audit.
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

const reconcileStatus = run("node", ["scripts/run-ar-reconcile.mjs"]);
if (reconcileStatus === 2) {
  console.warn("SKIP reconcile — RPC not deployed; running inconsistency audit only");
} else if (reconcileStatus !== 0) {
  process.exit(reconcileStatus);
}

const auditStatus = run("node", ["scripts/verify-collection-inconsistencies.mjs"]);
process.exit(auditStatus);
