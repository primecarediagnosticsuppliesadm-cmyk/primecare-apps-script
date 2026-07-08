#!/usr/bin/env node
/** Phase 9.3 — Payroll mutation boundary (delegates to Phase 6A guard). */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const phase93Files = [
  "src/compensation/collectionCompensationModel.js",
  "src/compensation/hierarchicalCompensationModel.js",
  "src/compensation/executivePerformanceModel.js",
  "src/compensation/employee360BusinessProfileModel.js",
  "src/compensation/labPerformanceContributionModel.js",
  "src/founder/founderPerformanceCardsEngine.js",
].map((rel) => readFileSync(resolve(root, rel), "utf8")).join("\n");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }

const payrollWrites = [
  "previewPayrollRunWrite",
  "submitPayrollRunWrite",
  "approvePayrollRunWrite",
  "lockPayrollRunWrite",
  "exportPayrollRunWrite",
];
for (const fn of payrollWrites) {
  if (new RegExp(fn).test(phase93Files)) {
    fail(`guard.no_${fn}`, `Phase 9.3 models must not call ${fn}`);
    failures += 1;
  } else {
    pass(`guard.no_${fn}`, `Phase 9.3 models do not call ${fn}`);
  }
}

const run = spawnSync("node", [resolve(root, "scripts/verify-payroll-no-finance-mutation.mjs")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
});
process.stdout.write(run.stdout || "");
process.stderr.write(run.stderr || "");
if (run.status !== 0) failures += 1;

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — no payroll mutation in Phase 9.3\n");
