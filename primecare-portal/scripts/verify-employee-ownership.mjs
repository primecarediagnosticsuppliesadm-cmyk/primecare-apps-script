#!/usr/bin/env node
/** Phase 8.4 — Employee 360 ownership section verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");
const panelSrc = readFileSync(resolve(root, "src/components/compensation/EmployeeCompensation360Panel.jsx"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/peopleOps/EmployeeCompensation360Drawer.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildEmployeeOwnershipContext/.test(modelSrc), "model.employee_ctx", "employee ownership context builder");
assert(/ownershipChain/.test(modelSrc), "model.chain", "ownership chain field");
assert(/reportingExecutive/.test(modelSrc), "model.reporting_exec", "reporting executive field");
assert(/reportingAdmin/.test(modelSrc), "model.reporting_admin", "reporting admin field");
assert(/Future Hierarchical Compensation/.test(panelSrc), "ui.override", "future hierarchical compensation in Employee 360");
assert(/Business Ownership/.test(panelSrc), "ui.section", "ownership section in Employee 360 panel");
assert(/Reporting Executive/.test(panelSrc), "ui.reporting_exec", "reporting executive label in panel");
assert(/ownershipContext/.test(drawerSrc), "ui.drawer_prop", "drawer passes ownershipContext");
assert(/employeeOwnershipContext/.test(pageSrc), "ui.page_ctx", "page builds employee ownership context");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
