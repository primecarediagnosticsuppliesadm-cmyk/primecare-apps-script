#!/usr/bin/env node
/**
 * Read-only invoice lifecycle verification bundle.
 *
 * Runs existing invoice verifiers without remote/apply flags so no invoice,
 * payment, allocation, or order mutation probes execute.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-invoice-phase1.mjs",
  "verify-invoice-phase2.mjs",
  "verify-invoice-phase3.mjs",
  "verify-invoice-phase4.mjs",
  "verify-invoice-phase5.mjs",
  "verify-invoice-account-status.mjs",
  "verify-lab-account-fallback.mjs",
];

function run(script) {
  console.log(`\n--- ${script} ---\n`);
  const res = spawnSync("node", [`scripts/${script}`], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res.status ?? 1;
}

let failed = 0;
for (const script of SCRIPTS) {
  const status = run(script);
  if (status !== 0) failed += 1;
}

console.log("\n=== Invoice lifecycle verification complete ===\n");
if (failed) {
  console.log(`Overall: NO-GO (${failed} invoice verifier(s) failed)\n`);
  process.exit(1);
}

console.log("Overall: GO (read-only invoice lifecycle checks passed)\n");
