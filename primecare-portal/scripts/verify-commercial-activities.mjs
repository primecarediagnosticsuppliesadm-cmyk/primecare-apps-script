#!/usr/bin/env node
/** Phase 9.0 — Commercial activities verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceModel.js"), "utf8");
const readSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceRead.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/CommercialCrmPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildCommercialActivities/.test(modelSrc), "model.activities", "activities builder");
assert(/follow_up/.test(modelSrc), "model.followups", "includes qualification follow-ups");
assert(/fetchAgentVisitsBoundedRows/.test(readSrc), "read.visits", "reuses bounded visits read");
assert(/Field Activities/.test(pageSrc), "ui.activities", "activities screen");
assert(/Open Visits/.test(pageSrc), "ui.visits_link", "deep-link to visits");
assert(!/createAgentVisitWrite/.test(modelSrc + readSrc), "guard.no_visit_write", "no visit writes in commercial layer");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
