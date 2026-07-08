#!/usr/bin/env node
/** Phase 8.4 — Territory ownership verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/OwnershipTerritoryDashboard.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildTerritoryDashboard/.test(modelSrc), "model.territory_builder", "territory dashboard builder");
assert(/resolveAgentLabTerritoryLabel/.test(modelSrc), "reuse.territory_label", "reuses lab territory label helper");
assert(/dominantAdminForTerritory/.test(modelSrc), "model.dominant_admin", "dominant admin per territory");
assert(/potentialCompensationLabel/.test(modelSrc), "model.potential_comp", "potential compensation column");
assert(/Territory Management/.test(uiSrc), "ui.territory", "territory dashboard UI");
assert(/No routing engine/.test(uiSrc), "ui.dashboard_only", "territory screen is dashboard-only");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
