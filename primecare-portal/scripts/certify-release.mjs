#!/usr/bin/env node
/**
 * PrimeCare release certification orchestrator.
 *
 * Usage:
 *   npm run certify:release
 *   CERTIFY_QUICK=1 npm run certify:release
 *   CERTIFY_ALLOW_DIRTY=1 npm run certify:release
 *
 * Does not apply DB migrations. Does not push to Production.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const quick = String(process.env.CERTIFY_QUICK || "").trim() === "1";

/** @type {{ id: string, cmd: string, args: string[], env?: Record<string,string>, optional?: boolean }[]} */
const STAGES = [
  { id: "GIT SAFETY", cmd: "node", args: ["scripts/verify-git-release-safety.mjs"] },
  { id: "DEPLOY COMMIT", cmd: "node", args: ["scripts/verify-deploy-commit.mjs"] },
  { id: "BUILD", cmd: "npm", args: ["run", "build"] },
  { id: "RUNTIME IMPORT SAFETY", cmd: "node", args: ["scripts/verify-runtime-import-safety.mjs"] },
  { id: "READONLY SCRIPT GUARD", cmd: "node", args: ["scripts/verify-scripts-readonly.mjs"] },
  { id: "SCHEMA FOUNDATION", cmd: "node", args: ["scripts/verify-db-foundation.mjs"] },
  { id: "MANUAL SQL DRIFT", cmd: "node", args: ["scripts/verify-manual-sql-drift.mjs"] },
  { id: "QA/PROD PARITY ARTIFACTS", cmd: "node", args: ["scripts/verify-qa-prod-parity.mjs"] },
  { id: "NOTIFICATION CONTRACT", cmd: "node", args: ["scripts/verify-notification-contract.mjs"] },
  { id: "LEGACY DEPENDENCIES", cmd: "node", args: ["scripts/verify-legacy-dependency-gate.mjs"] },
  { id: "AGENT VISIT / NOTIFY REGRESSION", cmd: "node", args: ["scripts/verify-agent-visit-product-intelligence.mjs"] },
];

if (!quick) {
  STAGES.push(
    { id: "ZERO DEAD ENDS", cmd: "node", args: ["scripts/run-hq-zero-dead-ends-audit.mjs"] },
    { id: "RLS / BOUNDED READS", cmd: "node", args: ["scripts/verify-hq-rls-reads.mjs"] },
    { id: "PREDATOR CERTIFICATION", cmd: "node", args: ["scripts/run-hq-predator-certification.mjs"] },
    {
      id: "PERFORMANCE",
      cmd: "node",
      args: ["scripts/run-hq-performance-certification.mjs"],
      env: { PERF_SKIP_SEED: "1" },
    },
    {
      id: "GOLDEN PATH",
      cmd: "node",
      args: ["scripts/verify-primecare-production-golden-path.mjs"],
    }
  );
}

const results = [];

console.log("\n=== PRIMECARE RELEASE CERTIFICATION ===\n");
if (quick) console.log("(CERTIFY_QUICK=1 — core gates only)\n");

for (const stage of STAGES) {
  process.stdout.write(`→ ${stage.id} ... `);
  const r = spawnSync(stage.cmd, stage.args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(stage.env || {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ok = (r.status ?? 1) === 0;
  const combined = `${r.stdout || ""}\n${r.stderr || ""}`;
  results.push({ id: stage.id, ok, combined });
  console.log(ok ? "PASS" : "FAIL");
  if (!ok) {
    const tail = combined.trim().split("\n").slice(-12).join("\n");
    if (tail) console.log(tail);
  }
}

console.log("\n=== PRIMECARE RELEASE CERTIFICATION ===\n");
const width = Math.max(...results.map((r) => r.id.length));
for (const r of results) {
  console.log(`${r.id.padEnd(width)}  ${r.ok ? "PASS" : "FAIL"}`);
}

const blockers = results.filter((r) => !r.ok).map((r) => r.id);
if (blockers.length) {
  console.log("\nFINAL VERDICT: RELEASE BLOCKED\n");
  console.log("BLOCKERS:");
  for (const b of blockers) console.log(`- ${b}`);
  process.exit(1);
}

console.log("\nFINAL VERDICT: RELEASE GREEN\n");
process.exit(0);
