#!/usr/bin/env node
/**
 * Phase 7.2 executive analytics certification bundle.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCRIPTS = [
  "verify-executive-reporting-context.mjs",
  "verify-compensation-ratios.mjs",
  "verify-compensation-rankings.mjs",
  "verify-compensation-forecast.mjs",
  "verify-compensation-territories.mjs",
  "verify-compensation-no-finance-mutation.mjs",
];

let failures = 0;

function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

section("Phase 7.2 analytics certification");

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
console.log("\nOverall: GO — Phase 7.2 certification complete\n");
