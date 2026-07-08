#!/usr/bin/env node
/**
 * RC1 support pack readiness — documentation + rollback artifacts.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;

function pass(msg) {
  console.log(`PASS  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL  ${msg}`);
  failures += 1;
}

const SUPPORT_PACK = [
  ["Release Notes", "docs/QA/RC1/RC1_Release_Notes.md", ["RC1", "Release"]],
  ["Known Issues", "docs/QA/RC1/RC1_Known_Issues.md", ["GAP", "Known"]],
  ["Rollback Plan", "docs/QA/RC1/RC1_Rollback_Plan.md", ["rollback", "Rollback"]],
  ["Production Checklist", "docs/QA/RC1/RC1_Production_Checklist.md", ["Production", "checklist"]],
  ["Pilot Checklist", "docs/QA/RC1/RC1_Pilot_Checklist.md", ["Pilot", "pilot"]],
  ["Support Runbook", "docs/QA/RC1/RC1_Support_Runbook.md", ["Runbook", "support"]],
  ["Recovery Checklist", "docs/QA/RC1/RC1_Recovery_Checklist.md", ["Recovery", "restore"]],
  ["Human UAT Matrix", "docs/QA/RC1/RC1_Human_UAT_Matrix.md", ["UAT", "Scenario"]],
  ["GO/NO-GO", "docs/QA/RC1/RC1_GO_NO_GO.md", ["GO", "NO-GO"]],
];

const LEGACY_OPS = [
  "docs/operations/Sprint3A_Production_Runbook.md",
  "docs/operations/Sprint3A_Deployment_Rollback_Verification.md",
];

console.log("\n=== RC1 Support Readiness ===\n");

for (const [label, rel, keywords] of SUPPORT_PACK) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    fail(`${label} missing — ${rel}`);
    continue;
  }
  const body = readFileSync(path, "utf8");
  const hasKeyword = keywords.some((k) => body.toLowerCase().includes(k.toLowerCase()));
  if (hasKeyword) pass(`${label} — ${rel}`);
  else fail(`${label} — ${rel} (content incomplete)`);
}

for (const rel of LEGACY_OPS) {
  if (existsSync(resolve(root, rel))) pass(`legacy ops — ${rel}`);
  else fail(`legacy ops missing — ${rel}`);
}

if (existsSync(resolve(root, "scripts/audit-rc1-certification.mjs"))) {
  pass("audit-rc1-certification.mjs present");
} else {
  fail("audit-rc1-certification.mjs missing");
}

console.log(`\nSummary: FAIL=${failures}`);
if (failures > 0) {
  console.log("\nRESULT: FAIL — support pack incomplete\n");
  process.exit(1);
}
console.log("\nRESULT: PASS — support pack ready\n");
