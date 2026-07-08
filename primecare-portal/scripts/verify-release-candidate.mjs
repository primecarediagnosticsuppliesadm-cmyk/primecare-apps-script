#!/usr/bin/env node
/**
 * RC1 release candidate gate — static module boundaries, artifact presence, build.
 * No new features/schema/business logic. Orchestrates read-only certification checks.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
let warnings = 0;

function pass(id, msg) {
  console.log(`PASS  ${id}  ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}  ${msg}`);
  failures += 1;
}
function warn(id, msg) {
  console.warn(`WARN  ${id}  ${msg}`);
  warnings += 1;
}

function runNode(script) {
  const r = spawnSync("node", [resolve(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "" };
}

const MODULE_ARTIFACTS = [
  ["commercial", "src/pages/CommercialCrmPage.jsx", "src/commercial/commercialWorkspaceRead.js"],
  ["peopleOps", "src/components/peopleOps/PeopleOpsDashboard.jsx", "src/peopleOps/peopleOpsNavigation.js"],
  ["founderOs", "src/pages/FounderOperatingSystemPage.jsx", "src/founder/founderWorkspaceRead.js"],
  ["platform", "src/pages/ProductionReadinessDashboardPage.jsx", "src/platform/productionReadinessModel.js"],
  ["orders", "src/pages/OrdersPage.jsx", "src/api/primecareSupabaseApi.js"],
  ["collections", "src/pages/CollectionsPage.jsx", "src/api/invoiceSupabaseApi.js"],
  ["compensation", "src/pages/ExecutiveCompensationCenterPage.jsx", "src/api/compensationSupabaseApi.js"],
  ["payroll", "src/components/peopleOps/PeopleOpsPayrollSummary.jsx", "src/api/payrollDomainSupabaseApi.js"],
  ["logistics", "src/pages/LogisticsDeliveryPage.jsx", null],
  ["distributor", "src/pages/DistributorOsPage.jsx", null],
];

const RC1_DOCS = [
  "docs/QA/RC1/RC1_Release_Candidate_Audit.md",
  "docs/QA/RC1/RC1_Human_UAT_Matrix.md",
  "docs/QA/RC1/RC1_Known_Issues.md",
  "docs/QA/RC1/RC1_Pilot_Checklist.md",
  "docs/QA/RC1/RC1_Production_Checklist.md",
  "docs/QA/RC1/RC1_Support_Runbook.md",
];

const BOUNDARY_FILES = [
  "src/api/invoiceSupabaseApi.js",
  "src/api/payrollDomainSupabaseApi.js",
  "src/config/readProjectionFlags.js",
];

console.log("\n=== RC1 Release Candidate Verification ===\n");

for (const [module, primary, secondary] of MODULE_ARTIFACTS) {
  const paths = [primary, secondary].filter(Boolean);
  const missing = paths.filter((p) => !existsSync(resolve(root, p)));
  if (missing.length) fail(`RC1-MOD-${module}`, `missing: ${missing.join(", ")}`);
  else pass(`RC1-MOD-${module}`, paths.join(" + "));
}

for (const rel of RC1_DOCS) {
  if (existsSync(resolve(root, rel))) pass("RC1-DOC", rel);
  else fail("RC1-DOC", `missing ${rel}`);
}

for (const rel of BOUNDARY_FILES) {
  if (existsSync(resolve(root, rel))) pass("RC1-BND", rel);
  else fail("RC1-BND", `missing ${rel}`);
}

const flags = readFileSync(resolve(root, "src/config/readProjectionFlags.js"), "utf8");
if (flags.includes("isProjectionShadowMode") && !flags.match(/VITE_USE_PROJECTION[\s\S]*=\s*true/)) {
  pass("RC1-PROJ", "projection adapters remain shadow/opt-in");
} else {
  warn("RC1-PROJ", "review readProjectionFlags — projection may not be shadow-only");
}

const bundles = [
  "verify-runtime-import-safety.mjs",
  "verify-navigation-consolidation.mjs",
  "verify-compensation-no-finance-mutation.mjs",
  "verify-payroll-no-finance-mutation.mjs",
  "verify-bounded-reads.mjs",
  "verify-scripts-readonly.mjs",
];

for (const script of bundles) {
  const { ok, stderr } = runNode(script);
  if (ok) pass("RC1-BUNDLE", script);
  else {
    fail("RC1-BUNDLE", `${script} — ${stderr.slice(0, 200)}`);
  }
}

console.log("\n=== RC1 build gate ===\n");
const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", stdio: "pipe" });
if (build.status === 0) pass("RC1-BUILD", "npm run build");
else {
  fail("RC1-BUILD", "build failed");
  process.stderr.write(build.stderr || "");
}

console.log(`\nSummary: FAIL=${failures} WARN=${warnings}`);
if (failures > 0) {
  console.log("\nRESULT: FAIL — release candidate gate not met\n");
  process.exit(1);
}
console.log("\nRESULT: PASS — release candidate static gate\n");
