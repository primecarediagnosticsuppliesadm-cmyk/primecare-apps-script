#!/usr/bin/env node
/** Phase 9.3 — Hierarchical compensation display verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/compensation/hierarchicalCompensationModel.js"), "utf8");
const panelSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/HierarchicalCompensationPanel.jsx"), "utf8");
const ownershipSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/PeopleOpsOwnershipModule.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildHierarchicalCompensation/.test(modelSrc), "model.builder", "hierarchical builder");
assert(/adminOverride|executiveOverride/.test(modelSrc), "model.overrides", "admin and executive override display");
assert(/displayOnly:\s*true/.test(modelSrc), "model.display_only", "display only");
assert(/orgTree/.test(modelSrc), "model.org_tree", "uses ownership org tree");
assert(!/calculateCommissionEntries|calculatePayrollPreview/.test(modelSrc), "guard.no_engine", "no payroll engine calls");
assert(/HierarchicalCompensationPanel/.test(panelSrc), "ui.panel", "hierarchy panel");
assert(/hierarchicalCompensation/.test(ownershipSrc), "ownership.prop", "ownership module accepts model");
assert(/buildHierarchicalCompensation/.test(pageSrc), "page.builder", "page builds hierarchical model");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — hierarchical compensation verified\n");
