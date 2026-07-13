#!/usr/bin/env node
/** Phase 9.0 Commercial CRM certification bundle. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-commercial-dashboard.mjs",
  "verify-commercial-pipeline.mjs",
  "verify-commercial-lab360.mjs",
  "verify-commercial-forecast.mjs",
  "verify-commercial-activities.mjs",
  "verify-commercial-reuse.mjs",
  "verify-people-operations-shell.mjs",
  "verify-compensation-no-finance-mutation.mjs",
  "verify-payroll-no-finance-mutation.mjs",
  "verify-business-ownership.mjs",
];

let failures = 0;
function section(t) { console.log(`\n=== ${t} ===\n`); }

section("Phase 9.0 Commercial CRM certification");
for (const script of SCRIPTS) {
  const path = resolve(root, "scripts", script);
  const run = spawnSync("node", [path], { cwd: root, encoding: "utf8", stdio: "pipe" });
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  if (run.status !== 0) { console.error(`FAIL  bundle.${script}`); failures += 1; }
  else console.log(`PASS  bundle.${script}`);
}

section("Build gate");
const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", stdio: "pipe" });
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
if (build.status !== 0) { console.error("FAIL  build"); failures += 1; }
else console.log("PASS  build");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO — Phase 9.0 certification complete\n");
