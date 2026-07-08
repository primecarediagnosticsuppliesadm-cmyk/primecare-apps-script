#!/usr/bin/env node
/**
 * RC1 golden path complete — re-certify O2C + payroll read chain.
 * Requires .env.local + QA Supabase credentials for live checks.
 */
import { existsSync } from "node:fs";
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
    env: process.env,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  return { ok: r.status === 0, out };
}

const CHAIN_STEPS = [
  { id: "GP-CHAIN-01", script: "verify-primecare-production-golden-path.mjs", label: "Qual → Contract → Order → Invoice → Payment → Allocation" },
  { id: "GP-CHAIN-02", script: "verify-financial-reconciliation.mjs", label: "Tenant financial reconciliation" },
  { id: "GP-CHAIN-03", script: "verify-order-payment-sync.mjs", label: "Order/payment sync" },
  { id: "GP-CHAIN-04", script: "verify-ar-reconcile.mjs", label: "AR reconcile" },
  { id: "GP-CHAIN-05", script: "verify-transaction-integrity-rpcs.mjs", label: "ORDER_OUT idempotency RPCs" },
  { id: "GP-CHAIN-06", script: "verify-invoice-account-status.mjs", label: "Invoice account status" },
  { id: "GP-CHAIN-07", script: "verify-cash-only-commission.mjs", label: "Commission on cash (payroll path)" },
  { id: "GP-CHAIN-08", script: "verify-founder-snapshot.mjs", label: "Founder reporting snapshot" },
];

console.log("\n=== RC1 Golden Path Complete Certification ===\n");

if (!existsSync(resolve(root, ".env.local"))) {
  fail("GP-ENV", "Missing .env.local — cannot run live golden path");
  console.log("\nRESULT: FAIL — environment not configured\n");
  process.exit(1);
}

for (const step of CHAIN_STEPS) {
  const { ok, out } = runNode(step.script);
  const hasWarn = /RESULT:\s*WARN|WARN\s+\d|legacy drift/i.test(out);
  if (ok && !hasWarn) pass(step.id, step.label);
  else if (ok && hasWarn) {
    warn(step.id, `${step.label} — legacy drift documented`);
  } else {
    fail(step.id, `${step.label} — ${out.slice(-400)}`);
  }
}

console.log(`\nSummary: FAIL=${failures} WARN=${warnings}`);
if (failures > 0) {
  console.log("\nRESULT: FAIL — golden path incomplete\n");
  process.exit(1);
}
if (warnings > 0) {
  console.log("\nRESULT: WARN — golden path passes with documented legacy drift\n");
  process.exit(0);
}
console.log("\nRESULT: PASS — golden path complete\n");
