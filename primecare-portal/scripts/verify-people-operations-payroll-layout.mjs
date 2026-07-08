#!/usr/bin/env node
/** Phase 8.2 — People Operations payroll layout verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const summarySrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsPayrollSummary.jsx"), "utf8");
const workflowSrc = readFileSync(resolve(root, "src/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/PeopleOpsPayrollSummary/.test(pageSrc), "payroll.summary_wired", "payroll summary on run review");
assert(/PeopleOpsPayrollStickyTotals/.test(pageSrc), "payroll.sticky_totals", "sticky payroll totals on run review");
assert(/PeopleOpsWorkflowProgress/.test(pageSrc), "payroll.workflow_wired", "workflow progress on run review");
assert(/variant="default"[\s\S]{0,220}Open Preview/.test(pageSrc), "payroll.primary_cta", "Open Preview is primary CTA");
assert(/Gross Payroll/.test(summarySrc), "payroll.summary_gross", "gross payroll KPI");
assert(/Net Payroll/.test(summarySrc), "payroll.summary_net", "net payroll KPI");
assert(/current/.test(workflowSrc), "payroll.workflow_current", "workflow highlights current stage");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
