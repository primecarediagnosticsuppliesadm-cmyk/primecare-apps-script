#!/usr/bin/env node
/** Phase 8.4 — Lab ownership / Lab drawer verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/LabOwnership360Drawer.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildLab360Model/.test(modelSrc), "model.lab360", "lab ownership model builder exported");
assert(/export function buildOwnershipTimelineForLab/.test(modelSrc), "model.timeline", "ownership timeline builder");
assert(/transferred/.test(modelSrc), "model.transfer_event", "timeline supports transferred events");
assert(/ordersVolumeLabel/.test(modelSrc), "model.orders", "lab model exposes orders volume");
assert(/paymentsCountLabel/.test(modelSrc), "model.payments", "lab model exposes payments count");
assert(/Lab Ownership/.test(drawerSrc), "ui.lab_drawer", "Lab Ownership drawer component");
assert(/OwnershipTimelinePanel/.test(drawerSrc), "ui.timeline_in_drawer", "timeline in lab drawer");
assert(/LabOwnership360Drawer/.test(pageSrc), "ui.wired", "Lab drawer wired on page");
assert(!/assignLabOwnership/.test(drawerSrc), "guard.no_assign", "no assignment in lab drawer");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
