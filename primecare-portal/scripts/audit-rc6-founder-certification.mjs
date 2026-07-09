#!/usr/bin/env node
/** RC6 — Founder dashboard language certification bundle (UI only). */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-rc6-founder-language.mjs",
  "verify-rc5-business-language.mjs",
  "verify-people-operations-dashboard.mjs",
  "verify-people-operations-productivity.mjs",
  "verify-people-operations-payroll-layout.mjs",
  "verify-compensation-no-finance-mutation.mjs",
  "verify-payroll-no-finance-mutation.mjs",
];

const RC6_PATHS = [
  "src/peopleOps/peopleOpsBusinessCopy.js",
  "src/peopleOps/productivity/peopleOpsFounderDayBoard.js",
  "src/components/peopleOps/PeopleOpsDashboard.jsx",
  "src/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx",
  "src/components/peopleOps/productivity/PeopleOpsRecentActivity.jsx",
  "src/components/peopleOps/productivity/PeopleOpsFounderDayBoard.jsx",
  "src/components/peopleOps/productivity/PeopleOpsWorkInbox.jsx",
  "src/components/peopleOps/productivity/PeopleOpsContextWidget.jsx",
];

let failures = 0;
function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

section("RC6 Founder dashboard language certification");
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
  if (run.status !== 0) {
    console.error(`FAIL  bundle.${script}`);
    failures += 1;
  } else {
    console.log(`PASS  bundle.${script}`);
  }
}

section("Boundary — no write paths in RC6 UX files");
const rc6Src = RC6_PATHS.map((rel) => readFileSync(resolve(root, rel), "utf8")).join("\n");
for (const fn of ["submitPayrollRunWrite", "calculatePayrollPreview", "createPaymentWrite", "generatePayrollPreview"]) {
  if (new RegExp(fn).test(rc6Src)) {
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
console.log("\nOverall: GO — RC6 Founder dashboard language complete\n");
