#!/usr/bin/env node
/**
 * Phase 9.1 — Navigation consolidation verification.
 * Ensures one workspace home per domain; duplicate sidebar entries removed.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const menuConfig = readFileSync(resolve(root, "src/config/menuConfig.js"), "utf8");
const platformModel = readFileSync(resolve(root, "src/platform/platformConsolidationModel.js"), "utf8");
const roleMatrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");

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

assert(/NAV_DEEP_LINK_ONLY_KEYS/.test(platformModel), "platform.deep_link_registry", "deep-link registry exists");
assert(/qualificationReview/.test(platformModel), "platform.qual_hidden", "qualificationReview in deep-link set");
assert(/founderFinancialIntelligence/.test(platformModel), "platform.founder_hidden", "founder FI in deep-link set");
assert(/commissionEngine/.test(platformModel), "platform.commission_hidden", "commissionEngine in deep-link set");

assert(/PLATFORM_WORKSPACE_HOMES/.test(platformModel), "platform.workspace_homes", "workspace home map exists");
assert(/commercial:\s*"commercialCrm"/.test(platformModel), "home.commercial", "Commercial is growth home");
assert(/people:\s*"compensationPayroll"/.test(platformModel), "home.people", "People Ops is people home");
assert(/operations:\s*"operationsCenter"/.test(platformModel), "home.operations", "Operations Center is ops home");

assert(/isDeepLinkOnlyNavKey/.test(menuConfig), "menu.deep_link_filter", "menu filters deep-link keys from sidebar");

const execGrowthMatch = menuConfig.match(/HQ_EXECUTIVE_MENU_SECTIONS[\s\S]*?growth[\s\S]*?keys:\s*\[([^\]]+)\]/);
if (execGrowthMatch) {
  const growthKeys = execGrowthMatch[1];
  assert(!/qualificationReview/.test(growthKeys), "menu.exec_growth_no_qual", "Executive GROWTH has no Qualification Analytics");
  assert(!/commissionEngine/.test(growthKeys), "menu.exec_growth_no_commission", "Executive GROWTH has no Commission Engine");
  assert(/commercialCrm/.test(growthKeys), "menu.exec_growth_commercial", "Executive GROWTH has Commercial only");
} else {
  fail("menu.exec_growth_section", "Could not parse HQ_EXECUTIVE_MENU_SECTIONS growth keys");
}

const adminGrowthMatch = menuConfig.match(/HQ_ADMIN_MENU_SECTIONS[\s\S]*?growth[\s\S]*?keys:\s*\[([^\]]+)\]/);
if (adminGrowthMatch) {
  const growthKeys = adminGrowthMatch[1];
  assert(!/qualificationReview/.test(growthKeys), "menu.admin_growth_no_qual", "Admin GROWTH has no Qualification Analytics");
  assert(/commercialCrm/.test(growthKeys), "menu.admin_growth_commercial", "Admin GROWTH has Commercial");
} else {
  fail("menu.admin_growth_section", "Could not parse HQ_ADMIN_MENU_SECTIONS growth keys");
}

assert(/label:\s*"FOUNDER"/.test(menuConfig), "menu.founder_section", "FOUNDER sidebar section present for Founder OS");
assert(!/label:\s*"FOUNDER"[\s\S]*founderFinancialIntelligence/.test(menuConfig.match(/HQ_EXECUTIVE_MENU_SECTIONS[\s\S]*?\];/)?.[0] || ""), "menu.founder_no_legacy_fi", "Founder FI not in FOUNDER section");

assert(/productionReadiness/.test(menuConfig), "menu.production_readiness", "Architecture Readiness in menu config");
assert(/productionReadiness:\s*\[/.test(roleMatrix), "perm.production_readiness", "productionReadiness permission declared");

assert(!/createPaymentWrite|allocatePaymentToInvoiceWrite|payrollDomainSupabaseApi/.test(menuConfig), "boundary.no_finance_in_nav", "No finance API imports in menu config");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — navigation consolidation verified\n");
