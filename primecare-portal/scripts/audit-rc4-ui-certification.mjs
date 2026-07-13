#!/usr/bin/env node
/** RC4 — Enterprise finish pass certification bundle (UI only). */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-rc4-enterprise-polish.mjs",
  "verify-rc3-people-ops-ui.mjs",
  "verify-people-operations-productivity.mjs",
  "verify-people-operations-dashboard.mjs",
  "verify-people-operations-payroll-layout.mjs",
  "verify-people-operations-enterprise-ux.mjs",
  "verify-people-ops-model-render.mjs",
  "verify-enterprise-ui-consistency.mjs",
  "verify-empty-states.mjs",
  "verify-loading-states.mjs",
  "verify-responsive-layouts.mjs",
  "verify-runtime-import-safety.mjs",
  "audit-rc3-ui-certification.mjs",
];

const RC4_PATHS = [
  "src/components/peopleOps/PeopleOpsDashboard.jsx",
  "src/components/peopleOps/PeopleOpsReportingContextBar.jsx",
  "src/components/peopleOps/productivity/PeopleOpsContextWidget.jsx",
  "src/components/peopleOps/ReportsExecutiveSummary.jsx",
  "src/components/peopleOps/PeopleOpsTableToolbar.jsx",
  "src/components/ux/KpiCard.jsx",
  "src/peopleOps/peopleOpsDataQualityModel.js",
];

let failures = 0;
function section(t) { console.log(`\n=== ${t} ===\n`); }

section("RC4 Enterprise finish pass certification");
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

section("Boundary — no write paths in RC4 UX files");
const rc4Src = RC4_PATHS.map((rel) => readFileSync(resolve(root, rel), "utf8")).join("\n");
for (const fn of ["submitPayrollRunWrite", "calculatePayrollPreview", "createPaymentWrite", "generatePayrollPreview"]) {
  if (new RegExp(fn).test(rc4Src)) {
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
console.log("\nOverall: GO — RC4 Enterprise finish pass complete\n");
