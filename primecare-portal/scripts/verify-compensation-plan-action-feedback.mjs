#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const plansSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlansTab.jsx"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlanActionDrawer.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/compensation/mapCompensationPlanMutationError.js"), "utf8");
const errorUiSrc = readFileSync(resolve(root, "src/components/ux/ActionErrorSummary.jsx"), "utf8");

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

assert(/CompensationPlanActionDrawer/.test(plansSrc), "ui.create_drawer", "Create Plan opens action drawer");
assert(!/NewCompensationPlanWizard/.test(plansSrc), "ui.no_inline_wizard", "inline wizard removed from plans tab");
assert(/ActionErrorSummary/.test(drawerSrc), "ui.drawer_error", "drawer shows action error summary");
assert(/role=\"alert\"/.test(errorUiSrc), "ui.alert_role", "action error uses alert role");
assert(/Plan code and version already exist/.test(mapperSrc), "map.duplicate_title", "duplicate constraint mapped to business title");
assert(!/compensation_plans_code_version_key/.test(drawerSrc), "ui.no_raw_constraint", "drawer does not expose raw constraint name");
assert(/mapCompensationPlanMutationError/.test(pageSrc), "page.mutation_mapper", "page uses mutation error mapper");
assert(/return \{ success: false, error:/.test(pageSrc), "page.mutation_return", "plan handlers return mutation results");
assert(!/setError\(err\?\.message \|\| \"Could not create compensation plan\"\)/.test(pageSrc), "page.no_create_global_error", "create plan no longer uses global page error");
assert(/assertNoDuplicatePlanCodeVersion/.test(pageSrc), "page.client_duplicate_guard", "client duplicate guard before insert");
assert(/Open Existing Plan/.test(mapperSrc), "map.open_existing", "duplicate error suggests open existing plan");
assert(/PlansReadinessCard|active plans ·/.test(plansSrc), "ui.readiness_card", "single readiness card present");
assert(!/CompensationExecutiveSummary/.test(pageSrc.match(/activeScreenId === \"plans\"[\\s\\S]{0,1200}/)?.[0] || ""), "ui.no_exec_summary_on_plans", "executive summary removed from plans screen");
assert(!/KpiCardGrid/.test(plansSrc), "budget.no_kpi_grid", "duplicate KPI grid removed from plans tab");
assert(/placeholder=\"Search plans/.test(plansSrc), "ui.search", "plans search retained");
assert(/Activate/.test(plansSrc), "ui.activate_plan", "activate plan action retained");
assert(/Duplicate/.test(plansSrc), "ui.duplicate_plan", "duplicate plan action retained");
assert(/onSavePlan/.test(plansSrc), "ui.edit_plan", "edit/save plan retained");
assert(/onViewAssignments/.test(plansSrc), "ui.view_assignments", "view assignments retained");
assert(/showWorkflowProgress[\s\S]*assignments/.test(pageSrc), "ui.no_payroll_strip_on_plans", "workflow strip excluded from plans screen");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — compensation plan action feedback verified\n");
