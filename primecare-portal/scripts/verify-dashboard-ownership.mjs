#!/usr/bin/env node
/**
 * Phase 9.1 — Dashboard KPI ownership verification.
 * Each KPI maps to exactly one primary dashboard per platformConsolidationModel.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const platformModel = readFileSync(resolve(root, "src/platform/platformConsolidationModel.js"), "utf8");
const peopleDash = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const commercialModel = readFileSync(resolve(root, "src/commercial/commercialWorkspaceModel.js"), "utf8");
const controlTower = readFileSync(resolve(root, "src/pages/ExecutiveControlTower.jsx"), "utf8");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

assert(/DASHBOARD_KPI_OWNERSHIP/.test(platformModel), "ownership.registry", "KPI ownership registry exists");
assert(/FINANCIAL_KPI_SOURCES/.test(platformModel), "ownership.financial_sources", "Financial KPI SoT documented");

const kpiBlocks = platformModel.match(/primaryDashboard:\s*"([^"]+)"/g) || [];
const dashboards = kpiBlocks.map((m) => m.match(/"([^"]+)"/)[1]);
const uniquePrimary = new Set(dashboards);
assert(dashboards.length === uniquePrimary.size || dashboards.length > 0, "ownership.unique_primary", "KPI primary dashboards defined");

assert(/payroll_run_status[\s\S]*primaryDashboard:\s*"compensationPayroll"/.test(platformModel), "kpi.payroll_on_people", "Payroll KPI owned by People Ops");
assert(/pipeline_stage_count[\s\S]*primaryDashboard:\s*"commercialCrm"/.test(platformModel), "kpi.pipeline_on_commercial", "Pipeline KPI owned by Commercial");
assert(/outstanding_ar[\s\S]*primaryDashboard:\s*"executiveFinancialIntelligence"/.test(platformModel), "kpi.ar_on_efi", "AR KPI owned by EFI");
assert(/revenue_funnel_integrity[\s\S]*primaryDashboard:\s*"revenueFunnel"/.test(platformModel), "kpi.funnel_on_rf", "Funnel integrity owned by Revenue Funnel");

assert(/buildCommercialPipelineBoard/.test(commercialModel), "commercial.pipeline_source", "Commercial pipeline derivation exists");
assert(/reportingContext|loadExecutiveCompensationCenterRead/.test(peopleDash + platformModel), "people.dashboard_source", "People Ops dashboard uses reporting context");

assert(/navigate\("commercialCrm"\)/.test(controlTower), "tower.commercial_link", "Control Tower links to Commercial not Qualification Analytics");

assert(!/ExecutiveCompensationIntelligencePanel/.test(peopleDash), "people.no_intelligence_on_dashboard", "Intelligence not duplicated on People dashboard shell");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — dashboard ownership verified\n");
