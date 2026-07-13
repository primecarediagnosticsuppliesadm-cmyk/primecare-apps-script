#!/usr/bin/env node
/**
 * Phase 8.1 — People Operations shell + module navigation verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const dashboardSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const navSrc = readFileSync(resolve(root, "src/peopleOps/peopleOpsNavigation.js"), "utf8");
const navUiSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOperationsModuleNav.jsx"), "utf8");
const enterpriseCopy = readFileSync(resolve(root, "src/config/enterpriseCopy.js"), "utf8");
const portal = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");

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

assert(/People Operations/.test(enterpriseCopy), "copy.menu_label", "sidebar label is People Operations");
assert(/PeopleOperationsPage/.test(pageSrc), "page.export", "page exports PeopleOperationsPage");
assert(/ExecutiveCompensationCenterPage/.test(pageSrc), "page.legacy_alias", "legacy page alias preserved");
assert(/PeopleOperationsModuleNav/.test(pageSrc), "page.module_nav", "page wires module navigation");
assert(/peopleOpsNavigation/.test(pageSrc), "page.nav_constants", "page uses peopleOps navigation constants");
assert(!/const TABS\s*=/.test(pageSrc), "page.no_flat_tabs", "flat tab array removed");
assert(!/activeTab/.test(pageSrc), "page.no_active_tab", "activeTab state removed");

for (const moduleId of ["dashboard", "employees", "compensation", "payroll", "budgeting", "ownership", "reports", "settings"]) {
  assert(new RegExp(`id:\\s*"${moduleId}"`).test(navSrc), `nav.module.${moduleId}`, `${moduleId} module declared`);
}

assert(/LEGACY_TAB_TO_ROUTE/.test(navSrc), "nav.legacy_map", "legacy tab migration map present");
assert(/PEOPLE_OPS_MODULES/.test(navUiSrc), "nav.ui.modules", "module nav renders PEOPLE_OPS_MODULES");

assert(
  /activeModuleId === "dashboard"/.test(pageSrc) && /activeScreenId === "home"/.test(pageSrc),
  "screen.dashboard",
  "dashboard home screen wired"
);
assert(/activeModuleId === "employees"/.test(pageSrc), "screen.employees", "employees module wired");
assert(
  /activeModuleId === "compensation"/.test(pageSrc) && /activeScreenId === "plans"/.test(pageSrc),
  "screen.compensation_plans",
  "compensation plans screen wired"
);
assert(
  /activeModuleId === "payroll"/.test(pageSrc) && /activeScreenId === "run-review"/.test(pageSrc),
  "screen.payroll_review",
  "payroll run review screen wired"
);
assert(
  /activeModuleId === "reports"/.test(pageSrc) && /activeScreenId === "analytics"/.test(pageSrc),
  "screen.reports_analytics",
  "reports analytics screen wired"
);
assert(
  /activeModuleId === "settings"/.test(pageSrc) && /activeScreenId === "configuration"/.test(pageSrc),
  "screen.settings",
  "settings placeholder screen wired"
);
assert(
  /activeModuleId === "budgeting"/.test(pageSrc) && /PeopleOpsBudgetingModule/.test(pageSrc),
  "screen.budgeting",
  "budgeting module wired"
);
assert(
  /activeModuleId === "ownership"/.test(pageSrc) && /PeopleOpsOwnershipModule/.test(pageSrc),
  "screen.ownership",
  "ownership module wired"
);

assert(
  !/PeopleOpsDashboard[\s\S]{0,2000}TrendBars/.test(pageSrc + dashboardSrc),
  "ia.intelligence_not_on_dashboard",
  "intelligence/trend charts not on dashboard"
);
assert(
  /PeopleOpsReportsPanel/.test(pageSrc) || /activeModuleId === "reports"[\s\S]*ExecutiveCompensationIntelligencePanel/.test(pageSrc),
  "ia.intelligence_on_reports",
  "intelligence panel on reports analytics"
);

assert(/loadExecutiveCompensationCenterRead/.test(pageSrc), "reuse.read_loader", "existing read loader unchanged");
assert(/buildExecutiveCompensationModel/.test(pageSrc), "reuse.model", "existing model orchestrator unchanged");
assert(/ExecutiveCompensationCenterPage/.test(portal), "portal.route", "portal lazy import path unchanged");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
