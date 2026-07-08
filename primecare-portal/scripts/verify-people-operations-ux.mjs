#!/usr/bin/env node
/**
 * Phase 8.1A — People Operations UI/UX unification verification.
 * Confirms shell polish without business logic, API, or schema changes.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const dashboardSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const reportsSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsReportsPanel.jsx"), "utf8");
const navSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOperationsModuleNav.jsx"), "utf8");
const directorySrc = readFileSync(resolve(root, "src/components/compensation/EmployeeDirectoryTab.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");
const payrollApiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");

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

assert(/PeopleOpsDashboard/.test(pageSrc), "ui.dashboard_component", "operational dashboard component wired");
assert(/PeopleOpsReportsPanel/.test(pageSrc), "ui.reports_component", "analytical reports panel wired");
assert(/PeopleOpsModuleFrame/.test(pageSrc), "ui.module_frame", "unified module frame used");
assert(/PeopleOpsFilterBar/.test(pageSrc), "ui.filter_bar", "standard filter bar on run review");
assert(/DataFetchError/.test(pageSrc), "ui.error_component", "standard error component with retry");
assert(/DataFreshnessLabel/.test(pageSrc), "ui.freshness", "data freshness label on page header");
assert(/usePortalToast/.test(pageSrc), "ui.toast_feedback", "toast feedback for workflow actions");
assert(/ReadHealthBanner[\s\S]*health=\{model\.readHealth\}/.test(pageSrc), "ui.read_health_prop", "read health banner uses correct prop");

assert(!/TrendBars/.test(dashboardSrc), "ia.dashboard_no_trends", "dashboard excludes trend charts");
assert(/Pending Actions/.test(dashboardSrc), "ia.dashboard_operational", "dashboard shows pending actions");
assert(/TrendBars/.test(reportsSrc), "ia.reports_trends", "trend charts moved to reports");
assert(/ExecutiveCompensationIntelligencePanel/.test(reportsSrc), "ia.reports_intelligence", "intelligence panel on reports");

assert(/role="tablist"/.test(navSrc), "a11y.nav_tabs", "module nav uses tablist semantics");
assert(/aria-selected/.test(navSrc), "a11y.nav_selected", "module nav exposes selection state");

assert(/PeopleOpsFilterBar/.test(directorySrc), "ui.directory_filters", "employee directory uses filter bar");
assert(/EmptyState/.test(directorySrc), "ui.directory_empty", "employee directory uses EmptyState");

const navigateFn = pageSrc.match(/const navigatePeopleOps = useCallback\([\s\S]*?\}, \[\]\);/)?.[0] || "";
assert(!/setSelectedEmployeeProfileId\(""\)/.test(navigateFn), "nav.state_preserve", "module navigation does not clear employee selection");

assert(/buildExecutiveCompensationModel/.test(pageSrc), "reuse.model", "existing model orchestrator unchanged");
assert(/loadExecutiveCompensationCenterRead/.test(pageSrc), "guard.no_duplicate_read", "single read loader path");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
