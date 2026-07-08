#!/usr/bin/env node
/** Phase 8.4 — Business ownership module verification (canonical lab_ownership reuse). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const navSrc = readFileSync(resolve(root, "src/peopleOps/peopleOpsNavigation.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");
const readSrc = readFileSync(resolve(root, "src/peopleOps/ownership/peopleOpsOwnershipRead.js"), "utf8");
const engineSrc = readFileSync(resolve(root, "src/operations/labOwnershipEngine.js"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/labOwnershipApi.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/id:\s*"ownership"/.test(navSrc), "nav.ownership", "ownership module declared");
assert(/Business Ownership/.test(navSrc), "nav.label", "module labeled Business Ownership");
assert(/explorer/.test(navSrc) && /territories/.test(navSrc), "nav.screens", "ownership screens declared");
assert(/PeopleOpsOwnershipModule/.test(pageSrc), "ui.module", "ownership module wired on page");
assert(/buildPeopleOpsOwnershipWorkspace/.test(pageSrc), "ui.workspace", "ownership workspace built on page");
assert(/loadPeopleOpsOwnershipRead/.test(pageSrc), "ui.read", "parallel ownership read on page");
assert(/canonicalSource:\s*"lab_ownership"/.test(modelSrc), "model.canonical", "declares lab_ownership as canonical SoT");
assert(/buildOwnershipIndex/.test(modelSrc), "reuse.engine", "reuses labOwnershipEngine");
assert(/getLabOwnershipRead/.test(readSrc), "read.reuse", "reuses labOwnershipApi read");
assert(/export function buildOwnershipIndex/.test(engineSrc), "sot.engine", "canonical engine present");
assert(/assignLabOwnership/.test(apiSrc), "sot.write_api", "canonical write API remains Operations");
assert(!/assignLabOwnership|deactivate_lab_ownership/.test(modelSrc + readSrc), "guard.no_writes", "no ownership writes in People Ops layer");
assert(!/generatePayrollPreview/.test(modelSrc), "guard.no_payroll_gen", "no payroll generation");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
