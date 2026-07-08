#!/usr/bin/env node
/**
 * Phase 9.1 — Production Readiness Dashboard verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const page = readFileSync(resolve(root, "src/pages/ProductionReadinessDashboardPage.jsx"), "utf8");
const model = readFileSync(resolve(root, "src/platform/productionReadinessModel.js"), "utf8");
const portal = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const menuConfig = readFileSync(resolve(root, "src/config/menuConfig.js"), "utf8");
const qaValidation = readFileSync(resolve(root, "src/config/qaValidation.js"), "utf8");

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

assert(/ProductionReadinessDashboardPage/.test(page), "page.exists", "Production Readiness page exists");
assert(/Architecture Readiness/.test(page), "page.title", "Not Founder Command Center");
assert(/not Founder Command Center/i.test(page), "page.not_founder", "Founder OS deferred notice present");
assert(/buildProductionReadinessModel/.test(model), "model.builder", "Readiness model builder exists");
assert(/projectionReadiness|Projection Readiness/.test(model), "model.projection_section", "Projection readiness section");
assert(/Manual UAT/.test(model), "model.uat_section", "Manual UAT section");
assert(/ProductionReadinessDashboardPage/.test(portal), "portal.wired", "Portal routes production readiness");
assert(/isProductionReadinessDashboardEnabled/.test(qaValidation + menuConfig), "menu.gated", "Dashboard env-gated");
assert(/productionReadiness/.test(menuConfig), "menu.key", "Menu key declared");

assert(!/createPaymentWrite|payrollDomainSupabaseApi|compensationCalculationEngine/.test(page + model), "boundary.no_mutations", "No finance/payroll API in readiness dashboard");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — production readiness dashboard verified\n");
