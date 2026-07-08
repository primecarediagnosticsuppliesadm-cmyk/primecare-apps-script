#!/usr/bin/env node
/** Phase 9.0 — Commercial forecast verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceModel.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/CommercialCrmPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildCommercialForecast/.test(modelSrc), "model.forecast", "forecast builder");
assert(/expectedPayrollImpactLabel/.test(modelSrc), "model.payroll_readonly", "payroll impact labeled read-only");
assert(/previewOnly:\s*true/.test(modelSrc), "model.preview", "forecast preview-only");
assert(/Commercial Forecast/.test(pageSrc), "ui.forecast", "forecast screen");
assert(/People Ops Budgeting/.test(pageSrc), "ui.budget_link", "deep-link to budgeting");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
