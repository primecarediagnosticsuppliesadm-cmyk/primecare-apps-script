#!/usr/bin/env node
/** Phase 8.2 — People Operations enterprise UX verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const directorySrc = readFileSync(resolve(root, "src/components/compensation/EmployeeDirectoryTab.jsx"), "utf8");
const plansSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlansTab.jsx"), "utf8");
const settingsSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsSettingsLanding.jsx"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/peopleOps/EmployeeCompensation360Drawer.jsx"), "utf8");
const enterpriseSrc = readFileSync(resolve(root, "src/peopleOps/peopleOpsEnterpriseModel.js"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/EmployeeCompensation360Drawer/.test(pageSrc), "ui.drawer", "Employee 360 opens in drawer");
assert(/EnterpriseDataTable/.test(directorySrc), "ui.directory_table", "directory uses EnterpriseDataTable");
assert(/PeopleOpsTableShell/.test(directorySrc), "ui.directory_shell", "directory uses PeopleOpsTableShell");
assert(/onBulkAssignPlan/.test(directorySrc), "ui.bulk_assign", "bulk assign action present");
assert(/openDirectoryAssignmentWorkflow/.test(pageSrc), "ui.directory_assign_route", "directory assign opens assignments workflow");
assert(!/onBulkAssignPlan=\{\(rows\) => \{[\s\S]*openEmployee\(rows\[0\]\)/.test(pageSrc), "ui.no_assign_via_360", "assign plan does not open employee 360");
assert(/resolved\.moduleId === "compensation"[\s\S]*closeEmployeeDrawer/.test(pageSrc), "ui.comp_nav_closes_drawer", "compensation navigation closes employee 360 drawer");
assert(/PeopleOpsActionMenu/.test(plansSrc), "ui.overflow_menu", "compensation plans use overflow menu");
assert(/buildCompensationSummaryStats/.test(plansSrc), "ui.comp_summary", "compensation summary cards");
assert(/Active Configuration/.test(settingsSrc), "ui.settings_landing", "settings landing distinguishes active vs roadmap");
assert(/buildPayrollRunSummary/.test(enterpriseSrc), "ui.payroll_summary_model", "payroll summary derivation");
assert(!/supabase\/migrations/.test(pageSrc + enterpriseSrc), "guard.no_schema", "no schema changes");
assert(modelSrc === readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8"), "guard.model", "compensation model unchanged");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
