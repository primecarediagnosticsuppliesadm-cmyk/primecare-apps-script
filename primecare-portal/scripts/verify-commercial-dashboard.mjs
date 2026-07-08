#!/usr/bin/env node
/** Phase 9.0 — Commercial dashboard verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceModel.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/CommercialCrmPage.jsx"), "utf8");
const navSrc = readFileSync(resolve(root, "src/commercial/commercialNavigation.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildCommercialDashboardKpis/.test(modelSrc), "model.kpis", "dashboard KPI builder");
assert(/pipelineValue/.test(modelSrc) && /forecastCollections/.test(modelSrc), "model.forecast_kpis", "pipeline/forecast KPIs");
assert(/Commercial Dashboard/.test(pageSrc), "ui.dashboard", "dashboard screen");
assert(/id:\s*"dashboard"/.test(navSrc), "nav.dashboard", "dashboard module");
assert(!/generatePayrollPreview|submitPayrollRunWrite/.test(modelSrc + pageSrc), "guard.no_payroll", "no payroll mutations");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
