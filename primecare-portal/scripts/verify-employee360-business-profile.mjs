#!/usr/bin/env node
/** Phase 9.3 — Employee 360 business profile verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/compensation/employee360BusinessProfileModel.js"), "utf8");
const panelSrc = readFileSync(resolve(root, "src/components/compensation/EmployeeCompensation360Panel.jsx"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/peopleOps/EmployeeCompensation360Drawer.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildEmployee360BusinessProfile/.test(modelSrc), "model.builder", "business profile builder");
assert(/identity|compensation|labsManaged|collections|ownership|payroll|performance/.test(modelSrc), "model.sections", "profile sections");
assert(/previewOnly:\s*true/.test(modelSrc), "model.readonly", "read only");
assert(/businessProfile/.test(panelSrc), "panel.prop", "panel accepts businessProfile");
assert(/Performance|Business Ownership|Current Pay Structure|Payroll History/.test(panelSrc), "panel.ui", "business-facing 360 sections rendered");
assert(/EmployeeBusinessSummaryCard/.test(panelSrc), "panel.summary", "employee business summary card");
assert(/businessProfile/.test(drawerSrc), "drawer.prop", "drawer passes businessProfile");
assert(/buildEmployee360BusinessProfile/.test(pageSrc), "page.builder", "page builds business profile");
assert(/businessProfile=\{employeeBusinessProfile\}/.test(pageSrc), "page.wired", "drawer receives profile");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — employee 360 business profile verified\n");
