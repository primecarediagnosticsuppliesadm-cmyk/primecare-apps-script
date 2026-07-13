#!/usr/bin/env node
/** Phase 8.4 — Compensation preview read-only verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const previewSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/CompensationAttributionPreview.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");
const compModelSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");
const compReadSrc = readFileSync(resolve(root, "src/api/compensationReadSupabaseApi.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildCompensationAttributionPreview/.test(modelSrc), "model.preview_builder", "attribution preview builder");
assert(/Hierarchical Compensation \(Display\)|displayOnly:\s*true/.test(modelSrc), "model.display_title", "display hierarchical compensation title");
assert(/adminOverrideAmount|executiveOverrideAmount/.test(modelSrc), "model.override_amounts", "admin and executive override display amounts");
assert(/commissionByAgent/.test(modelSrc), "reuse.preview_lines", "reuses preview row commission totals");
assert(/Future Hierarchical Compensation|Preview only/.test(previewSrc), "ui.preview_label", "UI shows preview hierarchical label");
assert(!/calculateCommissionEntries|calculatePayrollPreview/.test(modelSrc), "guard.no_engine", "ownership model does not call calculation engine");
assert(/buildExecutiveCompensationModel/.test(compModelSrc), "guard.comp_model", "executive compensation model intact");
assert(!/loadPeopleOpsOwnershipRead/.test(compReadSrc), "guard.comp_read_untouched", "compensation read API not extended for ownership");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
