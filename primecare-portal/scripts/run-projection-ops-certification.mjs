#!/usr/bin/env node
/**
 * Run full projection ops certification — staleness + ops verify + report.
 * Usage: node scripts/run-projection-ops-certification.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const STEPS = [
  ["verify-projection-staleness.mjs", "staleness"],
  ["verify-projection-ops-center.mjs", "ops-center"],
  ["generate-projection-ops-report.mjs", "ops-report"],
];

console.log("\n=== Projection ops certification ===\n");

let failed = 0;
for (const [script, label] of STEPS) {
  const run = spawnSync("node", [resolve(root, "scripts", script)], {
    encoding: "utf8",
    cwd: root,
  });
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  if (run.status !== 0) {
    console.error(`FAIL  ${label} — exit ${run.status}`);
    failed += 1;
  } else {
    console.log(`PASS  ${label}`);
  }
}

console.log(`\n=== Certification complete — ${failed ? "NO-GO" : "GO"} ===\n`);
process.exitCode = failed ? 1 : 0;
