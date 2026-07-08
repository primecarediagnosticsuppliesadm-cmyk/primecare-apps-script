#!/usr/bin/env node
/** RC2 — People Operations UX verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const dash = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const emp = readFileSync(resolve(root, "src/components/compensation/EmployeeDirectoryTab.jsx"), "utf8");
const panel = readFileSync(resolve(root, "src/components/compensation/EmployeeCompensation360Panel.jsx"), "utf8");
const frame = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsModuleFrame.jsx"), "utf8");
const settings = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsSettingsLanding.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/EnterpriseMetricStrip/.test(dash), "dash.metric_strip", "compact KPI strip");
assert(/ReportingContextToolbar/.test(dash), "dash.context_toolbar", "inline reporting toolbar");
assert(/RoleChip/.test(emp), "emp.role_chip", "role chips in directory");
assert(/PeopleOpsFilterBar/.test(emp), "emp.filter_bar", "sticky filter bar");
assert(/Identity & Business/.test(panel), "360.business_first", "business-first section label");
assert(/SECTION_ORDER/.test(panel), "360.section_order", "RC2 section ordering");
assert(/space-y-3/.test(frame), "frame.compact", "compact module frame spacing");
assert(/Future capability/.test(settings), "settings.professional", "professional settings copy");
assert(!/Phase 8\.6/.test(settings), "settings.no_dev_labels", "no developer phase labels");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — People Ops UX verified\n");
