#!/usr/bin/env node
/** Phase 9.3 — Collection compensation & executive performance certification bundle. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-collection-compensation.mjs",
  "verify-hierarchical-compensation.mjs",
  "verify-executive-performance.mjs",
  "verify-founder-performance-cards.mjs",
  "verify-lab-performance-contribution.mjs",
  "verify-employee360-business-profile.mjs",
  "verify-no-payroll-mutation.mjs",
  "verify-no-finance-mutation.mjs",
  "verify-compensation-preview-readonly.mjs",
  "verify-people-ops-model-render.mjs",
  "verify-runtime-import-safety.mjs",
];

let failures = 0;
function section(t) { console.log(`\n=== ${t} ===\n`); }

section("Phase 9.3 collection compensation certification");
for (const script of SCRIPTS) {
  const path = resolve(root, "scripts", script);
  if (!existsSync(path)) {
    console.error(`FAIL  missing.${script}`);
    failures += 1;
    continue;
  }
  const run = spawnSync("node", [path], { cwd: root, encoding: "utf8", stdio: "pipe" });
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  if (run.status !== 0) { console.error(`FAIL  bundle.${script}`); failures += 1; }
  else console.log(`PASS  bundle.${script}`);
}

section("Boundary — read models only");
for (const rel of [
  "src/compensation/collectionCompensationModel.js",
  "src/compensation/hierarchicalCompensationModel.js",
  "src/compensation/executivePerformanceModel.js",
  "src/api/payrollDomainSupabaseApi.js",
  "src/api/invoiceSupabaseApi.js",
]) {
  if (existsSync(resolve(root, rel))) console.log(`PASS  boundary.${rel}`);
  else { console.error(`FAIL  boundary.${rel}`); failures += 1; }
}

section("Build gate");
const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", stdio: "pipe" });
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
if (build.status !== 0) { console.error("FAIL  build"); failures += 1; }
else console.log("PASS  build");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO — Phase 9.3 certification complete (Year 1–3 business layer)\n");
