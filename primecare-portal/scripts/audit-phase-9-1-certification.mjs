#!/usr/bin/env node
/** Phase 9.1 Platform Consolidation certification bundle. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-navigation-consolidation.mjs",
  "verify-dashboard-ownership.mjs",
  "verify-report-consolidation.mjs",
  "verify-performance-readiness.mjs",
  "verify-production-readiness-dashboard.mjs",
  "verify-commercial-reuse.mjs",
  "verify-people-operations-shell.mjs",
  "verify-compensation-no-finance-mutation.mjs",
  "verify-payroll-no-finance-mutation.mjs",
  "verify-runtime-import-safety.mjs",
];

let failures = 0;
function section(t) {
  console.log(`\n=== ${t} ===\n`);
}

section("Phase 9.1 Platform Consolidation certification");
for (const script of SCRIPTS) {
  const path = resolve(root, "scripts", script);
  const run = spawnSync("node", [path], { cwd: root, encoding: "utf8", stdio: "pipe" });
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  if (run.status !== 0) {
    console.error(`FAIL  bundle.${script}`);
    failures += 1;
  } else {
    console.log(`PASS  bundle.${script}`);
  }
}

section("Boundary — no finance/payroll/commission engine changes");
const boundaryChecks = [
  ["src/api/invoiceSupabaseApi.js", "invoice API untouched by 9.1"],
  ["src/api/payrollDomainSupabaseApi.js", "payroll API present"],
];
for (const [rel, label] of boundaryChecks) {
  if (existsSync(resolve(root, rel))) console.log(`PASS  boundary.${label}`);
  else {
    console.error(`FAIL  boundary.${label}`);
    failures += 1;
  }
}

section("Build gate");
const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", stdio: "pipe" });
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
if (build.status !== 0) {
  console.error("FAIL  build");
  failures += 1;
} else {
  console.log("PASS  build");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Phase 9.1 certification complete\n");
