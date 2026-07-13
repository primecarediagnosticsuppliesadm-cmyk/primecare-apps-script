#!/usr/bin/env node
/** Phase 9.3 — Lab performance contribution verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/compensation/labPerformanceContributionModel.js"), "utf8");
const commercialSrc = readFileSync(resolve(root, "src/components/commercial/CommercialLab360Drawer.jsx"), "utf8");
const ownershipSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/LabOwnership360Drawer.jsx"), "utf8");
const ownershipModelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildLabPerformanceContribution/.test(modelSrc), "model.builder", "lab contribution builder");
assert(/payrollContribution|commissionContribution|growth|risk/.test(modelSrc), "model.fields", "contribution fields");
assert(/previewOnly:\s*true/.test(modelSrc), "model.readonly", "read only");
assert(/buildLabPerformanceContribution/.test(commercialSrc), "commercial.wired", "Commercial Lab 360 uses builder");
assert(/Performance contribution|activeSection === "performance"/.test(commercialSrc), "commercial.ui", "contribution section in commercial drawer");
assert(/buildLabPerformanceContribution/.test(ownershipSrc), "ownership.wired", "Lab ownership drawer uses builder");
assert(/export function buildLab360Model/.test(ownershipModelSrc), "reuse.lab360", "reuses existing lab 360 model");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — lab performance contribution verified\n");
