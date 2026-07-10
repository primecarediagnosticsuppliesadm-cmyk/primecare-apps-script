#!/usr/bin/env node
/** RC3 — People Operations enterprise UX finalization verification (UI only). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const dashboardSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const directorySrc = readFileSync(resolve(root, "src/components/compensation/EmployeeDirectoryTab.jsx"), "utf8");
const dataQualitySrc = readFileSync(resolve(root, "src/peopleOps/peopleOpsDataQualityModel.js"), "utf8");
const settingsSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsSettingsLanding.jsx"), "utf8");
const budgetSrc = readFileSync(resolve(root, "src/components/peopleOps/budgeting/WorkforceBudgetOverview.jsx"), "utf8");
const ownershipSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/OwnershipExplorerTree.jsx"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/PeopleOpsWorkInbox/.test(dashboardSrc), "rc3.work_inbox", "dashboard uses unified work inbox");
assert(!/PeopleOpsFavorites/.test(dashboardSrc), "rc3.no_favorites", "favorites removed from dashboard");
assert(/PeopleOpsRecentActivity/.test(dashboardSrc), "rc3.recent_activity", "recent activity on dashboard");
assert(/PeopleOpsDataQualityBanner/.test(dashboardSrc), "rc3.data_quality_dashboard", "data quality on dashboard");
assert(/PeopleOpsContextWidget/.test(pageSrc), "rc3.context_widget", "compact context widget wired");
assert(!/PeopleOpsContextPanel/.test(pageSrc), "rc3.no_legacy_context", "legacy context panel removed");
assert(/buildPeopleOpsDataQualityWarnings/.test(pageSrc), "rc3.data_quality_wired", "data quality warnings on page");
assert(/CompensationExecutiveSummary/.test(pageSrc), "rc3.comp_summary", "compensation executive summary");
assert(/PeopleOpsPayrollStickyTotals/.test(pageSrc), "rc3.payroll_sticky", "sticky payroll totals on run review");
assert(/employeesLabel/.test(readFileSync(resolve(root, "src/peopleOps/peopleOpsEnterpriseModel.js"), "utf8")), "rc3.payroll_empty_label", "empty run employee label");
assert(!/ReportingContextToolbar/.test(dashboardSrc), "rc3.no_inline_context_toolbar", "reporting context centralized in context widget");
assert(/handleTableKeyDown/.test(directorySrc), "rc3.employee_keyboard", "employee directory keyboard nav");
assert(/RoleChip/.test(directorySrc), "rc3.role_chips", "colored role chips in directory");
assert(/Active Configuration/.test(settingsSrc), "rc3.settings_active", "settings emphasizes active config");
assert(/Future Capabilities/.test(settingsSrc), "rc3.settings_roadmap", "settings separates roadmap");
assert(/Not configured|Configured \(derived envelope\)/.test(budgetSrc), "rc3.budget_status", "budget configured vs unconfigured");
assert(/filterTree/.test(ownershipSrc), "rc3.ownership_search", "ownership tree search/filter");
assert(/formatPeopleOpsMetricValue/.test(dataQualitySrc), "rc3.metric_formatting", "misleading zero formatting helper");
assert(/filterPeopleOpsDataQualityWarningsForModule/.test(dataQualitySrc), "rc3.module_blocker_filter", "module-scoped blocker filter");
assert(/moduleDataQualityWarnings/.test(pageSrc), "rc3.module_blockers_wired", "page filters blockers per module");
assert(!/supabase\/migrations/.test(pageSrc + dashboardSrc), "guard.no_schema", "no schema changes");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO — RC3 People Operations UI verified\n");
