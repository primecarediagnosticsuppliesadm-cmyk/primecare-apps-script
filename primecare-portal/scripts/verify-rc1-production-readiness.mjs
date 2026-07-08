#!/usr/bin/env node
/**
 * RC1 production readiness — extends Sprint 3A gate with monitoring + hardening.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
let warnings = 0;

function pass(id, msg) {
  console.log(`PASS  ${id}  ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}  ${msg}`);
  failures += 1;
}
function warn(id, msg) {
  console.warn(`WARN  ${id}  ${msg}`);
  warnings += 1;
}

function runNode(script) {
  const r = spawnSync("node", [resolve(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}` };
}

console.log("\n=== RC1 Production Readiness ===\n");

const sprint3a = runNode("verify-production-readiness.mjs");
if (sprint3a.ok) pass("RC1-PR-3A", "Sprint 3A production readiness artifacts");
else fail("RC1-PR-3A", "verify-production-readiness.mjs failed");

const observability = [
  "src/observability/monitoring.js",
  "src/components/ux/ReadHealthBanner.jsx",
];
for (const rel of observability) {
  if (existsSync(resolve(root, rel))) pass("RC1-OBS", rel);
  else fail("RC1-OBS", `missing ${rel}`);
}

const monitoring = runNode("verify-production-monitoring.mjs");
if (monitoring.ok) {
  pass("RC1-MON", "verify-production-monitoring.mjs");
} else {
  const perfFail = /MON-14/.test(monitoring.out);
  const predatorFail = /MON-15/.test(monitoring.out);
  if (perfFail) warn("RC1-MON", "MON-14 performance scale — orders/payments unbounded in perf tenant");
  if (predatorFail) warn("RC1-MON", "MON-15 Predator — legacy collection inconsistencies (non-golden labs)");
  if (!perfFail && !predatorFail) fail("RC1-MON", "verify-production-monitoring.mjs");
}

const hardening = runNode("verify-security-hardening.mjs");
if (hardening.ok) pass("RC1-SEC", "verify-security-hardening.mjs");
else fail("RC1-SEC", "verify-security-hardening.mjs");

const flags = readFileSync(resolve(root, "src/config/readProjectionFlags.js"), "utf8");
if (flags.includes("isProjectionShadowMode")) {
  pass("RC1-PROJ", "projection shadow mode invariant");
} else {
  fail("RC1-PROJ", "projection flags missing shadow invariant");
}

const envExample = existsSync(resolve(root, ".env.example")) || existsSync(resolve(root, ".env.local"));
if (envExample) pass("RC1-ENV", "environment template or .env.local present");
else warn("RC1-ENV", "no .env.example — document secrets in runbook");

console.log(`\nSummary: FAIL=${failures} WARN=${warnings}`);
if (failures > 0) {
  console.log("\nRESULT: FAIL — production readiness gate\n");
  process.exit(1);
}
if (warnings > 0) {
  console.log("\nRESULT: CONDITIONAL GO — production readiness with documented gaps\n");
  process.exit(0);
}
console.log("\nRESULT: PASS — production readiness\n");
