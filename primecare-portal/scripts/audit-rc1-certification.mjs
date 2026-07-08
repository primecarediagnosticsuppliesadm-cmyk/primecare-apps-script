#!/usr/bin/env node
/**
 * RC1 master certification bundle — pilot sign-off gate.
 * Rules: no new features/modules/schema/business logic.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const BUNDLE = [
  { script: "verify-rc1-uat-closure.mjs", required: true },
  { script: "verify-release-candidate.mjs", required: true },
  { script: "verify-golden-path-complete.mjs", required: true },
  { script: "verify-role-certification.mjs", required: true },
  { script: "verify-rc1-production-readiness.mjs", required: true },
  { script: "verify-support-readiness.mjs", required: true },
  { script: "verify-performance-readiness.mjs", required: true },
  { script: "audit-phase-9-1-certification.mjs", required: true },
  { script: "audit-phase-9-2-certification.mjs", required: true },
  { script: "verify-compensation-no-finance-mutation.mjs", required: true },
  { script: "verify-payroll-no-finance-mutation.mjs", required: true },
];

let failures = 0;
let warnings = 0;

function section(t) {
  console.log(`\n${"=".repeat(60)}\n${t}\n${"=".repeat(60)}\n`);
}

section("PrimeCare RC1 — Production Readiness & Pilot Certification");

const results = [];

for (const { script, required } of BUNDLE) {
  const path = resolve(root, "scripts", script);
  const run = spawnSync("node", [path], { cwd: root, encoding: "utf8", stdio: "pipe" });
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  const out = `${run.stdout || ""}${run.stderr || ""}`;
  const tail = out.split("\n").slice(-25).join("\n");
  const isWarn =
    run.status === 0 &&
    (/RESULT:\s*(WARN|CONDITIONAL)/i.test(tail) ||
      /Overall:\s*CONDITIONAL/i.test(tail) ||
      /legacy drift documented/i.test(tail));
  if (run.status !== 0) {
    console.error(`\nFAIL  bundle.${script}\n`);
    failures += 1;
    results.push({ script, status: "FAIL" });
  } else if (isWarn) {
    console.log(`\nWARN  bundle.${script}\n`);
    warnings += 1;
    results.push({ script, status: "WARN" });
  } else {
    console.log(`\nPASS  bundle.${script}\n`);
    results.push({ script, status: "PASS" });
  }
}

section("RC1 Certification Summary");

for (const r of results) {
  console.log(`  ${r.status.padEnd(5)} ${r.script}`);
}

console.log(`\nTotals: PASS=${results.filter((r) => r.status === "PASS").length} WARN=${warnings} FAIL=${failures}`);

if (failures > 0) {
  console.log("\nOverall: NO-GO — RC1 certification failed (fix FAIL bundles before pilot)\n");
  process.exit(1);
}
const uatClosure = results.find((r) => r.script === "verify-rc1-uat-closure.mjs");
if (warnings > 0 && uatClosure?.status === "PASS") {
  console.log("\nOverall: GO — RC1 pilot certification complete (automated WARN documented; Human UAT PASS+WAIVED)\n");
  process.exit(0);
}
if (warnings > 0) {
  console.log("\nOverall: CONDITIONAL GO — automated gates pass with documented gaps; complete Human UAT matrix\n");
  process.exit(0);
}
console.log("\nOverall: GO — RC1 automated certification complete\n");
