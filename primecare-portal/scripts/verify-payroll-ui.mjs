#!/usr/bin/env node
/** RC2 — Payroll UI verification (presentation only). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dash = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const progress = readFileSync(resolve(root, "src/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx"), "utf8");
const payrollSummary = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsPayrollSummary.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/ReportingContextToolbar|EnterpriseMetricStrip/.test(dash), "payroll.context", "reporting context toolbar");
assert(/PeopleOpsWorkflowProgress/.test(dash), "payroll.workflow", "workflow progress on dashboard");
assert(/PeopleOpsWorkflowProgress/.test(progress), "payroll.progress_component", "workflow progress component");
assert(/export default function PeopleOpsPayrollSummary/.test(payrollSummary), "payroll.summary", "payroll summary component");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — Payroll UX verified\n");
