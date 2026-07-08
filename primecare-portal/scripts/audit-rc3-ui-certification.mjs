#!/usr/bin/env node
/** RC3 — Enterprise UX finalization certification bundle (UI only). */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-rc3-people-ops-ui.mjs",
  "verify-people-operations-productivity.mjs",
  "verify-people-operations-dashboard.mjs",
  "verify-people-operations-payroll-layout.mjs",
  "verify-people-operations-enterprise-ux.mjs",
  "verify-people-operations-navigation.mjs",
  "verify-people-ops-model-render.mjs",
  "verify-enterprise-ui-consistency.mjs",
  "verify-empty-states.mjs",
  "verify-loading-states.mjs",
  "verify-runtime-import-safety.mjs",
  "audit-rc2-ui-certification.mjs",
  "audit-phase-9-3-certification.mjs",
];

const RC3_PATHS = [
  "src/components/peopleOps/PeopleOpsDashboard.jsx",
  "src/components/peopleOps/productivity/PeopleOpsWorkInbox.jsx",
  "src/components/peopleOps/productivity/PeopleOpsContextWidget.jsx",
  "src/peopleOps/peopleOpsDataQualityModel.js",
  "src/components/peopleOps/PeopleOpsDataQualityBanner.jsx",
  "src/components/peopleOps/CompensationExecutiveSummary.jsx",
  "src/components/peopleOps/PeopleOpsPayrollStickyTotals.jsx",
];

let failures = 0;
function section(t) { console.log(`\n=== ${t} ===\n`); }

section("RC3 Enterprise UX certification");
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

section("Boundary — no business logic mutation in RC3 UX files");
const rc3Src = RC3_PATHS.map((rel) => readFileSync(resolve(root, rel), "utf8")).join("\n");
for (const fn of ["calculatePayrollPreview", "calculateCommissionEntries", "createPaymentWrite", "submitPayrollRunWrite"]) {
  if (new RegExp(fn).test(rc3Src)) {
    console.error(`FAIL  boundary.no_${fn}`);
    failures += 1;
  } else {
    console.log(`PASS  boundary.no_${fn}`);
  }
}

section("Build gate");
const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", stdio: "pipe" });
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
if (build.status !== 0) { console.error("FAIL  build"); failures += 1; }
else console.log("PASS  build");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO — RC3 Enterprise UX certification complete\n");
