#!/usr/bin/env node
/**
 * Phase 9.1 — Report consolidation verification (navigation only).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const platformModel = readFileSync(resolve(root, "src/platform/platformConsolidationModel.js"), "utf8");
const commercialNav = readFileSync(resolve(root, "src/commercial/commercialNavigation.js"), "utf8");
const peopleNav = readFileSync(resolve(root, "src/peopleOps/peopleOpsNavigation.js"), "utf8");
const menuConfig = readFileSync(resolve(root, "src/config/menuConfig.js"), "utf8");

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

assert(/REPORT_OWNERSHIP/.test(platformModel), "reports.registry", "Report ownership registry exists");

assert(/commercial_pipeline_report[\s\S]*module:\s*"commercialCrm"/.test(platformModel), "reports.commercial_pipeline", "Pipeline report owned by Commercial");
assert(/people_ops_analytics[\s\S]*module:\s*"compensationPayroll"/.test(platformModel), "reports.people_analytics", "People analytics owned by People Ops");
assert(/executive_financial_intelligence[\s\S]*duplicatesRemoved/.test(platformModel), "reports.efi_dedup", "EFI duplicates documented");

assert(/id:\s*"reports"/.test(commercialNav), "commercial.reports_module", "Commercial has Reports module");
assert(/id:\s*"reports"/.test(peopleNav), "people.reports_module", "People Ops has Reports module");

const execSections = menuConfig.match(/export const HQ_EXECUTIVE_MENU_SECTIONS = \[([\s\S]*?)\];/)?.[1] || "";
const execGrowthInSections = execSections.match(/id:\s*"growth"[\s\S]*?keys:\s*\[([^\]]+)\]/)?.[1] || "";
assert(!/qualificationReview/.test(execGrowthInSections), "nav.no_qual_report_entry", "No qualification report sidebar entry for executive growth section");

const reportModules = Object.values(
  [...platformModel.matchAll(/module:\s*"([^"]+)"/g)].map((m) => m[1])
);
const commercialReports = reportModules.filter((m) => m === "commercialCrm").length;
const peopleReports = reportModules.filter((m) => m === "compensationPayroll").length;
assert(commercialReports >= 1 && peopleReports >= 1, "reports.module_count", "Commercial and People report surfaces defined");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — report consolidation verified\n");
