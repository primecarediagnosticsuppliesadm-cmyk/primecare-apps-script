#!/usr/bin/env node
/** RC5 — Founder UX & business language verification (UI copy only). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const paths = {
  copy: "src/peopleOps/peopleOpsBusinessCopy.js",
  dataQuality: "src/peopleOps/peopleOpsDataQualityModel.js",
  banner: "src/components/peopleOps/PeopleOpsDataQualityBanner.jsx",
  help: "src/components/peopleOps/PeopleOpsPageHelp.jsx",
  onboarding: "src/components/peopleOps/PeopleOpsGuidedOnboarding.jsx",
  dashboard: "src/components/peopleOps/PeopleOpsDashboard.jsx",
  frame: "src/components/peopleOps/PeopleOpsModuleFrame.jsx",
  panel360: "src/components/compensation/EmployeeCompensation360Panel.jsx",
  summaryCard: "src/components/peopleOps/EmployeeBusinessSummaryCard.jsx",
  payrollEmpty: "src/components/peopleOps/PeopleOpsPayrollEmptyState.jsx",
  payrollLine: "src/components/peopleOps/PeopleOpsPayrollLineBreakdown.jsx",
  reports: "src/components/peopleOps/ReportsExecutiveSummary.jsx",
  ownership: "src/components/peopleOps/ownership/PeopleOpsOwnershipModule.jsx",
  labDrawer: "src/components/peopleOps/ownership/LabOwnership360Drawer.jsx",
  compensation: "src/components/peopleOps/CompensationExecutiveSummary.jsx",
  plans: "src/components/compensation/CompensationPlansTab.jsx",
  page: "src/pages/ExecutiveCompensationCenterPage.jsx",
  enterprise: "src/peopleOps/peopleOpsEnterpriseModel.js",
};

const src = Object.fromEntries(
  Object.entries(paths).map(([key, rel]) => [key, readFileSync(resolve(root, rel), "utf8")])
);

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  condition ? pass(id, detail) : fail(id, detail);
}

assert(/Payroll Blocker/.test(src.dataQuality), "rc5.payroll_blocker", "payroll blocker business language");
assert(/Commission Blocker/.test(src.dataQuality), "rc5.commission_blocker", "commission blocker business language");
assert(/Assign Plans|Assign Compensation Plans/.test(src.dataQuality), "rc5.cta_assign_plans", "assign plans CTA");
assert(/Open Ownership|Open Business Ownership/.test(src.dataQuality), "rc5.cta_ownership", "ownership CTA");
assert(/Generate Preview|Generate Payroll Preview/.test(src.dataQuality), "rc5.cta_preview", "generate preview CTA");
assert(/blockerLabel|Reason:/.test(src.banner), "rc5.banner_structure", "problem → reason → action banner");
assert(/What does this page do\?/.test(src.help), "rc5.page_help", "page help popover");
assert(/PEOPLE_OPS_PAGE_HELP/.test(src.copy), "rc5.help_copy", "help copy catalog");
assert(/PeopleOpsGuidedOnboarding/.test(src.dashboard), "rc5.onboarding", "guided onboarding on dashboard");
assert(/Employees → Compensation → Business Ownership → Payroll → Reports/.test(src.onboarding), "rc5.onboarding_flow", "five-step flow");
assert(/helpModuleId/.test(src.frame), "rc5.frame_help", "module frame hosts help");
assert(/Current Pay Structure|Payroll History|Business Ownership/.test(src.panel360), "rc5.360_labels", "renamed 360 sections");
assert(/These laboratories generate this employee/.test(src.panel360), "rc5.360_helper", "ownership helper text");
assert(/Identity|Business Summary|Payroll Summary|Performance Summary/.test(src.summaryCard), "rc5.employee_summary", "employee summary card");
assert(/How was this calculated\?/.test(src.payrollLine), "rc5.payroll_how", "payroll calculation guidance");
assert(/Salary|Fuel|Mobile|Commission|Adjustments|Recoveries|Bonuses|Net Payroll/.test(src.payrollLine), "rc5.payroll_breakdown", "expandable pay breakdown");
assert(/Payroll cannot be generated/.test(src.payrollEmpty + src.enterprise), "rc5.payroll_empty", "business empty payroll");
assert(/Best Performing Agent|Needs Attention|Promotion Candidates/.test(src.reports), "rc5.reports_summary", "reports business summary");
assert(/Organisation Ownership|commission, reporting/.test(src.ownership), "rc5.ownership_explainer", "ownership page explainer");
assert(/Primary Agent|Reporting Admin|Commission Path/.test(src.labDrawer), "rc5.lab_commission_path", "lab commission path labels");
assert(/Plans without Employees|Highest Commission %|Promotion Eligible/.test(src.compensation), "rc5.comp_summary", "compensation summary widgets");
assert(/Plan created successfully|Assign Employees/.test(src.plans), "rc5.plan_next_step", "post-create next step");
assert(/PeopleOpsPayrollLineBreakdown|PeopleOpsPayrollEmptyState/.test(src.page), "rc5.page_payroll_ux", "page uses payroll UX components");
assert(!/\bModel\b/.test(src.banner + src.help + src.onboarding), "rc5.no_model_word", "user-facing copy avoids Model");
assert(!/supabase\/migrations/.test(src.page + src.dataQuality), "guard.no_schema", "no schema changes");
assert(!/createPaymentWrite|submitPayrollRunWrite/.test(src.banner + src.help + src.onboarding + src.payrollLine + src.payrollEmpty), "guard.no_writes", "UX files have no write paths");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — RC5 business language verified\n");
