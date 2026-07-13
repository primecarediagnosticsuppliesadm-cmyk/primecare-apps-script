#!/usr/bin/env node
/** Phase 8.3 — Headcount planning verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/peopleOps/budgeting/workforceBudgetingModel.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/components/peopleOps/budgeting/WorkforceHeadcountPlanning.jsx"), "utf8");
const stateSrc = readFileSync(resolve(root, "src/peopleOps/budgeting/useWorkforcePlanningState.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildHeadcountPlanningRows/.test(modelSrc), "model.headcount_rows", "headcount row builder");
assert(/Add Position/.test(uiSrc), "ui.add_position", "add position action");
assert(/Duplicate Position/.test(uiSrc), "ui.duplicate", "duplicate position action");
assert(/Archive Position/.test(uiSrc), "ui.archive", "archive position action");
assert(/Hiring Cost/.test(uiSrc), "ui.hiring_cost", "hiring cost column");
assert(/sessionStorage/.test(stateSrc), "state.session", "headcount positions session-only");
assert(/addHeadcountPosition/.test(stateSrc), "state.add", "add position in session state");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
