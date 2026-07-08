#!/usr/bin/env node
/** Phase 8.3 — Budget scenario planning verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/peopleOps/budgeting/workforceBudgetingModel.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/components/peopleOps/budgeting/WorkforceScenarioPlanning.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildPlanningScenarios/.test(modelSrc), "model.scenarios", "scenario builder present");
assert(/HEADCOUNT_SCENARIO_TEMPLATES/.test(modelSrc), "model.templates", "headcount scenario templates");
assert(/forecast.scenarios/.test(modelSrc), "reuse.forecast_scenarios", "reuses intelligence forecast scenarios");
assert(/previewOnly/.test(modelSrc), "model.preview_only", "scenarios marked preview-only");
assert(/Save to History/.test(uiSrc), "ui.save_history", "save scenario to history action");
assert(/Add Scenario/.test(uiSrc), "ui.custom_scenario", "custom scenario UI");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
