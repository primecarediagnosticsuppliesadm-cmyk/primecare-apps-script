#!/usr/bin/env node
/**
 * PrimeCare v1.0 Operational Readiness pack — static evidence gate.
 * No application workflow changes. Docs + existing ops artifacts only.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ops = resolve(root, "docs/operations");
const rc1 = resolve(root, "docs/QA/RC1");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

const requiredOps = [
  "V1_Operational_Readiness_Execution.md",
  "V1_First_Customer_Operational_Gate.md",
  "V1_Critical_Workflow_Recovery_SOP.md",
  "HQ_PRODUCTION_ENV_CHECKLIST.md",
  "HQ_BACKUP_RECOVERY_RUNBOOK.md",
  "HQ_STORAGE_HEALTH_CHECK.md",
  "HQ_MONITORING_PLAN.md",
  "HQ_ALERTING_RUNBOOK.md",
  "HQ_SQL_MIGRATION_MANIFEST.md",
  "Sprint3A_Restore_Verification_Checklist.md",
  "Sprint3A_Production_Runbook.md",
];

for (const name of requiredOps) {
  assert(existsSync(resolve(ops, name)), `ops.${name}`, `${name} present`);
}

const requiredRc1 = [
  "RC1_GO_NO_GO.md",
  "RC1_Production_Readiness.md",
  "RC1_Production_Checklist.md",
  "RC1_Recovery_Checklist.md",
  "RC1_Support_Runbook.md",
  "RC1_Rollback_Plan.md",
  "RC1_Known_Issues.md",
];

for (const name of requiredRc1) {
  assert(existsSync(resolve(rc1, name)), `rc1.${name}`, `${name} present`);
}

const execSrc = readFileSync(resolve(ops, "V1_Operational_Readiness_Execution.md"), "utf8");
assert(/Priority 1/.test(execSrc), "plan.p1", "Priority 1 section present");
assert(/DR-01|Backup & Restore|restore drill/i.test(execSrc), "plan.dr", "DR / restore covered");
assert(/RLS/.test(execSrc), "plan.rls", "RLS covered");
assert(/Invoice PDF|generate-invoice-pdf/i.test(execSrc), "plan.pdf", "Invoice PDF covered");
assert(/No new modules/i.test(execSrc) || /no new modules/i.test(execSrc), "scope.no_modules", "No-new-modules stance");
assert(/PURCHASE_IN|CERT-004|receive/i.test(execSrc), "plan.receive", "Receive integrity covered");
assert(/does not roll back|non-atomic/i.test(execSrc), "plan.fulfill", "Fulfill non-atomic covered");

const gateSrc = readFileSync(resolve(ops, "V1_First_Customer_Operational_Gate.md"), "utf8");
assert(/Sign-off/.test(gateSrc), "gate.signoff", "First-customer sign-off present");
assert(/golden.?lab/i.test(gateSrc), "gate.golden", "Golden-lab scope present");

const sopSrc = readFileSync(resolve(ops, "V1_Critical_Workflow_Recovery_SOP.md"), "utf8");
assert(/Fulfill/.test(sopSrc) && /Receive/.test(sopSrc) && /Payment/.test(sopSrc), "sop.workflows", "Critical workflows in SOP");

assert(existsSync(resolve(root, "src/observability/monitoring.js")), "code.monitoring", "monitoring.js present");
assert(existsSync(resolve(root, "scripts/verify-rc1-production-readiness.mjs")), "script.rc1_pr", "RC1 production readiness script present");
assert(existsSync(resolve(root, "scripts/verify-production-monitoring.mjs")), "script.mon", "production monitoring script present");
assert(existsSync(resolve(root, "scripts/verify-hq-rls-reads.mjs")), "script.rls", "HQ RLS verify present");

const monSrc = readFileSync(resolve(root, "src/observability/monitoring.js"), "utf8");
assert(/VITE_SENTRY_DSN|getMonitoringConfig/.test(monSrc), "code.sentry_hook", "Sentry/env monitoring hooks present");
assert(/logStructured/.test(monSrc), "code.logging", "Structured logging present");

assert(
  !existsSync(resolve(root, "src/pages/SupplierMasterPage.jsx")),
  "scope.no_supplier_master_page",
  "no Supplier Master page invented"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — operational readiness pack verified\n");
