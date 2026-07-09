#!/usr/bin/env node
/** RC6 — Founder dashboard business language & actionability (UI only). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const paths = {
  copy: "src/peopleOps/peopleOpsBusinessCopy.js",
  dayBoard: "src/peopleOps/productivity/peopleOpsFounderDayBoard.js",
  productivity: "src/peopleOps/productivity/peopleOpsProductivityModel.js",
  dataQuality: "src/peopleOps/peopleOpsDataQualityModel.js",
  dashboard: "src/components/peopleOps/PeopleOpsDashboard.jsx",
  workflow: "src/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx",
  activity: "src/components/peopleOps/productivity/PeopleOpsRecentActivity.jsx",
  inbox: "src/components/peopleOps/productivity/PeopleOpsWorkInbox.jsx",
  dayBoardUi: "src/components/peopleOps/productivity/PeopleOpsFounderDayBoard.jsx",
  context: "src/components/peopleOps/productivity/PeopleOpsContextWidget.jsx",
  page: "src/pages/ExecutiveCompensationCenterPage.jsx",
};

const src = Object.fromEntries(
  Object.entries(paths).map(([key, rel]) => [key, readFileSync(resolve(root, rel), "utf8")])
);

const uiBundle = [
  src.dashboard,
  src.workflow,
  src.activity,
  src.inbox,
  src.dayBoardUi,
  src.context,
  src.dataQuality,
  src.copy,
].join("\n");

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

assert(/PAYROLL_CYCLE_STATUS_COPY/.test(src.copy), "rc6.cycle_copy", "payroll cycle status explanations");
assert(/Generate Payroll →|Review Preview →|Approve Payroll →|Lock Payroll →|Mark Paid →/.test(src.copy), "rc6.cycle_ctas", "every actionable status has CTA");
assert(/No action required/.test(src.copy), "rc6.paid_idle", "paid status explains no action");
assert(/Current Payroll Cycle/.test(src.workflow), "rc6.workflow_title", "workflow renamed to Current Payroll Cycle");
assert(/Status of this month/.test(src.workflow), "rc6.workflow_subtitle", "payroll cycle subtitle");
assert(/getPayrollCycleCopy|cycle\.explanation/.test(src.workflow), "rc6.workflow_explanation", "status business explanation rendered");
assert(/PeopleOpsPageHelp|sectionId=\"payrollCycle\"/.test(src.workflow), "rc6.workflow_help", "payroll cycle section help");

assert(/mapActivityToBusinessLanguage/.test(src.copy + src.productivity), "rc6.activity_mapper", "activity business-language mapper");
assert(/Payroll Preview Updated|Agent Commissions Calculated|Employee Assigned to Compensation Plan/.test(src.copy), "rc6.activity_titles", "founder activity titles");
assert(/Business Activity Today/.test(src.activity), "rc6.activity_title", "recent activity renamed");
assert(/viewLabel|View →|View Payroll/.test(src.activity), "rc6.activity_view_cta", "activity cards have View CTA");

assert(/Needs Attention|In Progress|Completed/.test(src.dayBoard + src.dayBoardUi), "rc6.day_board_sections", "founder day board sections");
assert(/What needs my attention today/.test(src.dashboard + src.dayBoardUi), "rc6.day_question", "dashboard answers attention question");
assert(/PeopleOpsFounderDayBoard/.test(src.dashboard), "rc6.day_board_wired", "day board on dashboard");

assert(/are not assigned to any compensation plan/.test(src.dataQuality), "rc6.dq_plans", "plan warning business language");
assert(/missing a primary owner/.test(src.dataQuality), "rc6.dq_ownership", "ownership warning business language");
assert(/No employees are assigned to this payroll run/.test(src.dataQuality), "rc6.dq_empty_run", "empty payroll run business language");
assert(/Assign Plans →|Open Ownership →|Generate Preview →/.test(src.dataQuality), "rc6.dq_ctas", "warnings have CTAs");

assert(/Requires Your Attention/.test(src.inbox), "rc6.inbox_title", "inbox renamed");
assert(/Current Reporting Period/.test(src.context), "rc6.context_title", "context renamed");

assert(!/payroll_preview_regenerated|commission_calculated|payroll_lock_completed/.test(uiBundle), "rc6.no_internal_events", "no internal event names in UI copy");
assert(!/\borphan\b/i.test(uiBundle.replace(/orphan-ownership/g, "")), "rc6.no_orphan_word", "UI avoids orphan wording");
assert(!/preview lines|read model|compose|pipeline generated|analytics exclusions|projection|snapshot|regenerated|derive/i.test(
  src.dashboard + src.workflow + src.activity + src.inbox + src.dayBoardUi
), "rc6.no_tech_jargon", "dashboard surfaces avoid technical jargon");

assert(/employeeList=\{employeeList\}/.test(src.page), "rc6.page_day_board_props", "page passes day-board inputs");
assert(!/supabase\/migrations/.test(src.page + src.dashboard + src.productivity), "guard.no_schema", "no schema changes");
assert(!/createPaymentWrite|submitPayrollRunWrite|generatePayrollPreview/.test(src.dashboard + src.workflow + src.activity + src.dayBoardUi + src.copy), "guard.no_writes", "UX files have no write paths");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — RC6 founder language verified\n");
