#!/usr/bin/env node
/**
 * Browser certification orchestrator — Phase 2 framework.
 * Runs API prereq scripts; prints manual browser checklist.
 * Does NOT automate browser (no Playwright). Does NOT mutate data.
 *
 * Usage:
 *   node scripts/run-browser-certification.mjs
 *   node scripts/run-browser-certification.mjs --prereq-only
 *   node scripts/run-browser-certification.mjs --suite o2c-golden
 *   node scripts/run-browser-certification.mjs --list
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const MANIFEST = resolve(root, "docs/Certification_Framework/browser-regression-manifest.json");
const GOLDEN_PATH = resolve(root, "docs/Certification_Framework/04_Browser_Golden_Path.md");

function parseArgs(argv) {
  const args = { prereqOnly: false, suite: "o2c-golden", list: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--prereq-only") args.prereqOnly = true;
    else if (argv[i] === "--list") args.list = true;
    else if (argv[i] === "--suite" && argv[i + 1]) {
      args.suite = argv[++i];
    }
  }
  return args;
}

function loadManifest() {
  if (!existsSync(MANIFEST)) {
    console.error("FATAL: Missing browser-regression-manifest.json");
    process.exit(1);
  }
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

function runScript(scriptName) {
  const scriptPath = resolve(root, "scripts", scriptName);
  if (!existsSync(scriptPath)) {
    return { script: scriptName, status: "SKIP", detail: "script not found" };
  }
  const t0 = Date.now();
  const run = spawnSync("node", [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const ms = Date.now() - t0;
  const output = (run.stdout || "") + (run.stderr || "");
  const tail = output.trim().split("\n").slice(-3).join(" | ");
  if (run.status !== 0) {
    return { script: scriptName, status: "FAIL", detail: tail || `exit ${run.status}`, ms };
  }
  return { script: scriptName, status: "PASS", detail: tail || "ok", ms };
}

function printSuiteList(manifest) {
  console.log("\n# Browser regression suites\n");
  for (const s of manifest.suites) {
    console.log(`- ${s.id}  [${s.tier}]  ${s.name}  (~${s.estimatedMinutes} min)`);
  }
  console.log("\nDefault: o2c-golden\n");
}

function printChecklist(suite, manifest) {
  console.log("\n# Manual browser checklist\n");
  console.log(`Suite: ${suite.name} (${suite.id})`);
  console.log(`QA URL: ${manifest.defaultQaUrl}`);
  console.log(`Golden path doc: docs/Certification_Framework/04_Browser_Golden_Path.md\n`);

  console.log("## Accounts\n");
  for (const role of suite.roles) {
    const acct = manifest.accounts[role];
    if (acct) console.log(`- ${role}: ${acct.email}`);
  }

  console.log("\n## Paths to visit\n");
  for (const p of suite.paths) console.log(`- ${manifest.defaultQaUrl}${p}`);

  console.log("\n## Steps to execute (in order)\n");
  for (const step of suite.steps) console.log(`- [ ] ${step}`);

  if (suite.perfSurfaces?.length) {
    console.log("\n## Performance surfaces to spot-check\n");
    for (const s of suite.perfSurfaces) console.log(`- ${s} (see 07_Performance_Certification_Matrix.md)`);
  }

  console.log("\n## Evidence\n");
  console.log("Record results in docs/QA/Browser_Golden_Path_YYYY-MM-DD.md");
  console.log("Copy 06_Release_Scorecard.md for full release sign-off.\n");

  if (existsSync(GOLDEN_PATH)) {
    console.log("Step definitions: 04_Browser_Golden_Path.md\n");
  }
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = loadManifest();

  if (args.list) {
    printSuiteList(manifest);
    process.exit(0);
  }

  const suite = manifest.suites.find((s) => s.id === args.suite);
  if (!suite) {
    console.error(`FATAL: Unknown suite "${args.suite}". Use --list.`);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("PrimeCare Browser Certification — API prereq gate");
  console.log("=".repeat(60));
  console.log(`Suite: ${suite.id}`);
  console.log(`Scripts: ${suite.prereqScripts.length}\n`);

  const results = [];
  for (const script of suite.prereqScripts) {
    process.stdout.write(`Running ${script} ... `);
    const r = runScript(script);
    results.push(r);
    console.log(`${r.status} (${r.ms ?? "?"}ms)`);
    if (r.status === "FAIL") console.log(`  → ${r.detail}`);
  }

  const fails = results.filter((r) => r.status === "FAIL");
  const passes = results.filter((r) => r.status === "PASS");

  console.log("\n--- Prereq summary ---");
  console.log(`PASS: ${passes.length}  FAIL: ${fails.length}  SKIP: ${results.length - passes.length - fails.length}`);

  if (fails.length > 0) {
    console.log("\nRESULT: PREREQ FAIL — do not start browser UAT until fixed.\n");
    process.exit(1);
  }

  console.log("\nRESULT: PREREQ PASS — API layer green for browser certification.\n");

  if (!args.prereqOnly) {
    printChecklist(suite, manifest);
  }

  process.exit(0);
}

main();
