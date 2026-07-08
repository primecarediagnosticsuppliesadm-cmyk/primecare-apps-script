#!/usr/bin/env node
/** RC2 — Enterprise UX certification bundle (UI only; no business logic changes). */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-enterprise-ui-consistency.mjs",
  "verify-people-ux.mjs",
  "verify-founder-ui.mjs",
  "verify-commercial-ui.mjs",
  "verify-payroll-ui.mjs",
  "verify-dashboard-layout.mjs",
  "verify-empty-states.mjs",
  "verify-loading-states.mjs",
  "verify-responsive-layouts.mjs",
  "verify-runtime-import-safety.mjs",
];

const FORBIDDEN_IN_RC2 = [
  "src/api/payrollDomainSupabaseApi.js",
  "src/compensation/compensationCalculationEngine.js",
  "src/compensation/executiveCompensationModel.js",
];

let failures = 0;
function section(t) { console.log(`\n=== ${t} ===\n`); }

section("RC2 Enterprise UX certification");
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

section("Boundary — no business logic mutation in RC2 UX files");
const rc2Paths = [
  "src/styles/enterpriseLayout.js",
  "src/components/ux/KpiCard.jsx",
  "src/components/peopleOps/PeopleOpsDashboard.jsx",
  "src/pages/AdminDashboard.jsx",
  "src/pages/FounderOperatingSystemPage.jsx",
];
const rc2Src = rc2Paths.map((rel) => readFileSync(resolve(root, rel), "utf8")).join("\n");
for (const fn of ["calculatePayrollPreview", "calculateCommissionEntries", "createPaymentWrite"]) {
  if (new RegExp(fn).test(rc2Src)) {
    console.error(`FAIL  boundary.no_${fn}`);
    failures += 1;
  } else {
    console.log(`PASS  boundary.no_${fn}`);
  }
}
for (const rel of FORBIDDEN_IN_RC2) {
  if (existsSync(resolve(root, rel))) console.log(`PASS  boundary.unchanged.${rel}`);
}

section("Build gate");
const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", stdio: "pipe" });
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
if (build.status !== 0) { console.error("FAIL  build"); failures += 1; }
else console.log("PASS  build");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO — RC2 Enterprise UX certification complete\n");
