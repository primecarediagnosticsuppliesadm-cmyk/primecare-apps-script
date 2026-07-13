#!/usr/bin/env node
/** Employee 360 Workspace — action-oriented UI verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/peopleOps/employee360/employee360WorkspaceModel.js"), "utf8");
const workspaceSrc = readFileSync(resolve(root, "src/components/peopleOps/employee360/Employee360Workspace.jsx"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/peopleOps/EmployeeCompensation360Drawer.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const navSrc = readFileSync(resolve(root, "src/peopleOps/peopleOpsNavigation.js"), "utf8");
const hrSrc = readFileSync(resolve(root, "src/peopleOps/employee360/peopleOpsHrModuleConfig.js"), "utf8");
const nbaSrc = readFileSync(resolve(root, "src/components/peopleOps/employee360/Employee360NextBestActionCard.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildEmployee360WorkspaceView/.test(modelSrc), "model.workspace", "workspace view builder");
assert(/buildEmployee360OperationalStatus/.test(modelSrc), "model.status", "operational status");
assert(/buildEmployee360NextBestAction/.test(modelSrc), "model.nba", "next best action");
assert(/buildEmployee360History/.test(modelSrc), "model.history", "merged history");
assert(/buildEmployee360RelationshipSummary/.test(modelSrc), "model.relationship", "relationship summary");
assert(/tasks: tasks\.slice\(0, 5\)/.test(modelSrc), "model.task_cap", "max 5 tasks");

assert(/Employee360NextBestActionCard/.test(workspaceSrc), "ui.nba", "NBA card");
assert(/Employee360OperationalStatusCard/.test(workspaceSrc), "ui.status", "operational status card");
assert(/Employee360CurrentTasksList/.test(workspaceSrc), "ui.tasks", "current tasks");
assert(/Employee360RelationshipSummary/.test(workspaceSrc), "ui.relationship", "relationship summary");
assert(/Employee360QuickActionsRow/.test(workspaceSrc), "ui.quick_actions", "quick actions row");
assert(/Employee360HistoryPanel/.test(workspaceSrc), "ui.history", "history panel");
assert(/data-testid="employee360-nba"/.test(nbaSrc), "ui.nba_single", "single NBA surface");
assert(!/EmployeeBusinessSummaryCard/.test(workspaceSrc), "ui.no_legacy_summary", "legacy summary removed");
assert(!/Documents|Assets|Leave/.test(workspaceSrc), "ui.no_hr_tabs", "HR tabs hidden until module enabled");

assert(/PEOPLE_OPS_HR_MODULE_ENABLED = false/.test(hrSrc), "hr.gate", "HR module disabled by default");

assert(/Employee360Workspace/.test(drawerSrc), "drawer.quick_view", "drawer uses compact workspace");
assert(/Quick view/i.test(drawerSrc), "drawer.label", "drawer labeled quick view");
assert(/mode="compact"/.test(drawerSrc), "drawer.compact", "compact mode");

assert(/Employee360Workspace/.test(pageSrc), "page.workspace", "full workspace on page");
assert(/screenId: "workspace"/.test(pageSrc), "page.workspace_route", "workspace route");
assert(/handleEmployee360Action/.test(pageSrc), "page.actions", "centralized actions");
assert(/openCompensationAssign/.test(pageSrc), "page.assign_drawer", "assign uses compensation drawer");
assert(/openEmployeeQuickView/.test(pageSrc), "page.quick_view", "quick view handler");
assert(!/onChangePlan=\{handleChangePlan\}/.test(pageSrc), "page.no_inline_plan", "no inline plan forms on drawer");

assert(/id: "workspace"/.test(navSrc), "nav.workspace", "workspace screen in nav");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — employee 360 workspace verified\n");
