#!/usr/bin/env node
/** Phase 8.2 — People Operations dashboard verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const dashboardSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const reportsSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsReportsPanel.jsx"), "utf8");
const enterpriseSrc = readFileSync(resolve(root, "src/peopleOps/peopleOpsEnterpriseModel.js"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildDashboardPayrollCard/.test(dashboardSrc), "dash.context_card", "payroll status card uses reporting context");
assert(/buildDashboardPendingActions/.test(dashboardSrc), "dash.pending_actions", "pending actions are actionable");
assert(/PeopleOpsReportingContextBar|PeopleOpsContextWidget/.test(readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8")), "dash.reporting_context", "reporting context in universal context widget");
assert(/PeopleOpsDataQualityBanner/.test(dashboardSrc), "dash.data_quality", "data quality banner on dashboard");
assert(!/TrendBars/.test(dashboardSrc), "dash.no_trends", "dashboard excludes trend charts");
assert(!/collectionEfficiencyLabel/.test(dashboardSrc), "dash.no_analytics_dup", "collection efficiency removed from dashboard");
assert(/model\.kpis\.employeeCount/.test(dashboardSrc), "dash.run_employee_count", "employee count from reporting context KPIs");
assert(/TrendBars/.test(reportsSrc), "reports.trends", "trends remain on reports");
assert(/buildPayrollRunSummary/.test(enterpriseSrc), "dash.single_run_derivation", "run summary helper available");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
