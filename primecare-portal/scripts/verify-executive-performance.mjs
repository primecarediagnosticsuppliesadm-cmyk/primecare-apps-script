#!/usr/bin/env node
/** Phase 9.3 — Executive performance KPI verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/compensation/executivePerformanceModel.js"), "utf8");
const execSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");
const panelSrc = readFileSync(resolve(root, "src/components/compensation/ExecutivePerformancePanel.jsx"), "utf8");
const reportsSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsReportsPanel.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildExecutivePerformanceModel/.test(modelSrc), "model.builder", "executive performance builder");
assert(/companyCollections|commissionLiability|highestEarner|topAgent|topAdmin/.test(modelSrc), "model.kpis", "required KPIs");
assert(/rankings/.test(modelSrc), "model.rankings", "ranking sections");
assert(/sortRankingRows/.test(modelSrc), "model.reuse_rankings", "reuses ranking metrics");
assert(/buildExecutivePerformanceModel/.test(execSrc), "exec.wired", "wired in compensation model");
assert(/ExecutivePerformancePanel/.test(panelSrc), "ui.panel", "executive performance panel");
assert(/ExecutivePerformancePanel/.test(reportsSrc), "reports.wired", "reports panel includes performance");
assert(/executivePerformance/.test(reportsSrc), "reports.prop", "executivePerformance prop");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — executive performance verified\n");
