#!/usr/bin/env node
/** Phase 8.3 — Workforce budgeting module verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const navSrc = readFileSync(resolve(root, "src/peopleOps/peopleOpsNavigation.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/budgeting/workforceBudgetingModel.js"), "utf8");
const payrollApiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/id:\s*"budgeting"/.test(navSrc), "nav.budgeting", "budgeting module declared");
assert(/overview/.test(navSrc) && /headcount/.test(navSrc) && /scenarios/.test(navSrc), "nav.screens", "budgeting screens declared");
assert(/PeopleOpsBudgetingModule/.test(pageSrc), "ui.module", "budgeting module wired on page");
assert(/buildWorkforceBudgetWorkspace/.test(pageSrc), "ui.workspace", "workforce workspace built on page");
assert(/useWorkforcePlanningState/.test(pageSrc), "ui.session", "session planning state hook");
assert(/buildWorkforceBudgetWorkspace/.test(modelSrc), "model.workspace", "planning workspace builder");
assert(/previewOnly:\s*true/.test(modelSrc), "model.preview_only", "planning flagged preview-only");
assert(/FORECAST_SCENARIO_PRESETS/.test(modelSrc), "reuse.forecast", "reuses forecast presets");
assert(!/\.insert\(|\.update\(|\.delete\(/.test(modelSrc + pageSrc), "guard.no_mutations", "no write APIs in budgeting layer");
assert(!/generatePayrollPreview/.test(modelSrc), "guard.no_payroll_gen", "no payroll generation in budgeting");
assert(!/submitPayrollRunWrite|approvePayrollRunWrite/.test(modelSrc), "guard.no_workflow", "no workflow mutations");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
