#!/usr/bin/env node
/**
 * Enterprise Architecture Enforcement Platform — orchestrator.
 *
 * Usage:
 *   node scripts/enforcement/run-architecture-enforcement.mjs [--profile pre-commit|pr|qa-deploy|prod-deploy|nightly|quarterly-arb]
 *   node scripts/enforcement/run-architecture-enforcement.mjs --validator architecture-validator
 *   ENFORCEMENT_MODE=full node scripts/enforcement/run-architecture-enforcement.mjs --profile pr
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, getChangedFiles, isIncrementalMode } from "./lib/fs-utils.mjs";
import { EnforcementSummary } from "./lib/report.mjs";
import { runArchitectureValidator } from "./validators/architecture-validator.mjs";
import { runBlueprintValidator } from "./validators/blueprint-validator.mjs";
import { runProjectionValidator } from "./validators/projection-validator.mjs";
import { runApiValidator } from "./validators/api-validator.mjs";
import { runPerformanceValidator } from "./validators/performance-validator.mjs";
import { runSecurityValidator } from "./validators/security-validator.mjs";
import { runDocumentationValidator } from "./validators/documentation-validator.mjs";

const VALIDATORS = {
  "architecture-validator": runArchitectureValidator,
  "blueprint-validator": runBlueprintValidator,
  "projection-validator": runProjectionValidator,
  "api-validator": runApiValidator,
  "performance-validator": runPerformanceValidator,
  "security-validator": runSecurityValidator,
  "documentation-validator": runDocumentationValidator,
};

function parseArgs() {
  const args = process.argv.slice(2);
  let profile = "pr";
  let singleValidator = null;
  let staged = true;
  let reportPath = null;
  let live = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && args[i + 1]) profile = args[++i];
    else if (args[i] === "--validator" && args[i + 1]) singleValidator = args[++i];
    else if (args[i] === "--all") staged = false;
    else if (args[i] === "--live") live = true;
    else if (args[i] === "--report" && args[i + 1]) reportPath = args[++i];
  }

  return { profile, singleValidator, staged, reportPath, live };
}

async function main() {
  const { profile, singleValidator, staged, reportPath, live } = parseArgs();
  const fitnessPath = resolve(REPO_ROOT, "docs/Architecture/Enforcement/Fitness_Functions.json");
  const config = JSON.parse(readFileSync(fitnessPath, "utf8"));

  const profileConfig = config.execution_profiles[profile];
  if (!singleValidator && !profileConfig) {
    console.error(`Unknown profile: ${profile}`);
    process.exit(2);
  }

  const incremental = profileConfig ? profileConfig.mode === "incremental" : isIncrementalMode();
  if (profileConfig?.mode === "full") process.env.ENFORCEMENT_MODE = "full";

  const scopeFiles = incremental ? getChangedFiles({ staged }) : [];
  const opts = {
    incremental,
    scopeFiles,
    staged,
    runLive: live || profile === "nightly" || profile === "qa-deploy",
  };

  if (incremental && !scopeFiles.length && profile === "pre-commit") {
    console.log("No staged files — pre-commit enforcement skipped (PASS)");
    process.exit(0);
  }

  console.log(`\nPrimeCare Architecture Enforcement — profile=${profile} mode=${incremental ? "incremental" : "full"}`);
  if (scopeFiles.length) console.log(`Scope: ${scopeFiles.length} changed file(s)`);

  const summary = new EnforcementSummary();
  const toRun = singleValidator ? [singleValidator] : profileConfig.validators;

  for (const name of toRun) {
    const fn = VALIDATORS[name];
    if (!fn) {
      console.error(`Unknown validator: ${name}`);
      process.exit(2);
    }
    summary.add(await fn(opts));
  }

  summary.print();

  const outDir = resolve(REPO_ROOT, "docs/Architecture/Enforcement/reports");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultReport = resolve(outDir, `enforcement-${profile}-${ts}.json`);
  const outPath = reportPath || defaultReport;
  writeFileSync(outPath, JSON.stringify(summary.toJSON(), null, 2));
  console.log(`\nReport: ${outPath}`);

  process.exit(summary.failed() ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
