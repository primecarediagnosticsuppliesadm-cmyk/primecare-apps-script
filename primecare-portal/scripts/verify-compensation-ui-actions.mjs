#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const plansSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlansTab.jsx"), "utf8");
const assignSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlanAssignmentsTab.jsx"), "utf8");
const assignModelSrc = readFileSync(resolve(root, "src/compensation/compensationAssignmentsViewModel.js"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/compensationPlanAdminSupabaseApi.js"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/CompensationPlanActionDrawer/.test(plansSrc), "ui.new_plan_wizard", "compensation plan action drawer");
assert(/Activate/.test(plansSrc), "ui.activate_plan", "activate plan action");
assert(/Assign Employee/.test(assignSrc), "ui.assign_employee", "assign employee action");
assert(/onViewAssignment/.test(assignSrc), "ui.view_assignment", "view assignment wired");
assert(/assignEmployeeToPlan/.test(apiSrc), "api.assign", "assign API");
assert(/activateCompensationPlan/.test(apiSrc), "api.activate", "activate API");
assert(/handleAssignEmployee/.test(pageSrc), "page.assign_handler", "assign handler on page");
assert(/assignmentIntent/.test(pageSrc), "page.assignment_intent", "directory assignment intent state");
assert(/openDirectoryAssignmentWorkflow/.test(pageSrc), "page.directory_assignment", "directory routes to assignments workflow");
assert(/COMPENSATION_ASSIGNMENT_SEGMENTS/.test(assignSrc), "ui.assignment_segments", "assignments tab has coverage segments");
assert(/findDuplicateActiveAssignmentProfiles/.test(assignModelSrc), "ui.duplicate_active_guard", "duplicate active assignments surfaced");
assert(/row\.kind === "active"/.test(assignSrc), "ui.history_read_only", "history rows exclude change/end actions");
assert(/onOpenAssign\?\.\(\{ profileUserId/.test(assignSrc), "ui.unassigned_assign_drawer", "unassigned row opens locked assign drawer");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO\n");
