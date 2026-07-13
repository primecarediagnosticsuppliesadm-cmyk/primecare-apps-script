#!/usr/bin/env node
/** Phase 8.3 — Budget overview dashboard verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/peopleOps/budgeting/workforceBudgetingModel.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/components/peopleOps/budgeting/WorkforceBudgetOverview.jsx"), "utf8");
const dashboardSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildBudgetOverviewKpis/.test(modelSrc), "model.overview_kpis", "overview KPI builder");
assert(/buildBudgetChartSeries/.test(modelSrc), "model.charts", "budget chart series");
assert(/currentPayrollLiability/.test(modelSrc), "model.reporting_context", "KPIs use reporting-context payroll");
assert(/Approved Budget/.test(uiSrc), "ui.approved_budget", "approved budget KPI");
assert(/Monthly Payroll/.test(uiSrc), "ui.monthly_chart", "monthly payroll chart");
assert(/Budget vs Actual/.test(uiSrc), "ui.budget_vs_actual", "budget vs actual chart");
assert(!/TrendBars/.test(dashboardSrc), "ia.dashboard_operational", "operational dashboard unchanged");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
