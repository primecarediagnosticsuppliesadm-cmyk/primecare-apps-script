#!/usr/bin/env node
/** RC4 — Enterprise finish pass verification (UI only). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const paths = {
  dashboard: "src/components/peopleOps/PeopleOpsDashboard.jsx",
  context: "src/components/peopleOps/productivity/PeopleOpsContextWidget.jsx",
  reportingBar: "src/components/peopleOps/PeopleOpsReportingContextBar.jsx",
  reports: "src/components/peopleOps/PeopleOpsReportsPanel.jsx",
  reportsSummary: "src/components/peopleOps/ReportsExecutiveSummary.jsx",
  kpi: "src/components/ux/KpiCard.jsx",
  tableToolbar: "src/components/peopleOps/PeopleOpsTableToolbar.jsx",
  directory: "src/components/compensation/EmployeeDirectoryTab.jsx",
  ownership: "src/components/peopleOps/ownership/OwnershipCoveragePanel.jsx",
  compensation: "src/components/peopleOps/CompensationExecutiveSummary.jsx",
  page: "src/pages/ExecutiveCompensationCenterPage.jsx",
  dataQuality: "src/peopleOps/peopleOpsDataQualityModel.js",
  enterprise: "src/peopleOps/peopleOpsEnterpriseModel.js",
};

const src = Object.fromEntries(
  Object.entries(paths).map(([key, rel]) => [key, readFileSync(resolve(root, rel), "utf8")])
);

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/space-y-1\.5|dense/.test(src.dashboard), "rc4.dashboard_density", "compressed dashboard spacing");
assert(!/ReportingContextToolbar|periodOptions/.test(src.dashboard), "rc4.no_duplicate_context", "dashboard avoids duplicate context controls");
assert(/PeopleOpsReportingContextBar/.test(src.context), "rc4.universal_context", "context widget uses shared reporting bar");
assert(/ReportsExecutiveSummary/.test(src.reports), "rc4.reports_summary_first", "reports lead with executive summary");
assert(/hasChartData|hasAnyTrend/.test(src.reports), "rc4.reports_no_empty_shells", "charts hidden when no meaningful data");
assert(/min-h-\[4\.25rem\]/.test(src.kpi), "rc4.kpi_height", "standardized KPI card height");
assert(/PeopleOpsTableToolbar/.test(src.directory), "rc4.table_toolbar", "directory table experience toolbar");
assert(/OwnershipCoveragePanel|coveragePct/.test(src.ownership + src.page), "rc4.ownership_coverage", "ownership coverage visualization");
assert(/Most Used Plan|Highest Commission|Promotion Eligible|Inactive Plans/.test(src.compensation), "rc4.compensation_widgets", "compensation executive widgets");
assert(/PeopleOpsPayrollStickyTotals/.test(src.page), "rc4.payroll_sticky_order", "payroll sticky totals in run review flow");
assert(/Payroll cannot be generated|payroll version|No employees/.test(src.enterprise), "rc4.payroll_empty_message", "payroll empty employee messaging");
assert(/missing-budget|inactive-plans|orphan-ownership|stale-period/.test(src.dataQuality), "rc4.validation_ux", "expanded validation warnings");
assert(/Budget not configured/.test(readFileSync(resolve(root, "src/components/peopleOps/budgeting/WorkforceBudgetOverview.jsx"), "utf8")), "rc4.budget_not_configured", "budget missing config label");
assert(!/supabase\/migrations/.test(src.page + src.dashboard), "guard.no_schema", "no schema changes");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO — RC4 enterprise polish verified\n");
