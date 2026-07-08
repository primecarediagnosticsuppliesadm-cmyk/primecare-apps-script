#!/usr/bin/env node
/**
 * Phase 9.1 — Performance readiness audit (static; no engine rewrites).
 */
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const platformModel = readFileSync(resolve(root, "src/platform/platformConsolidationModel.js"), "utf8");
const hqBounds = readFileSync(resolve(root, "src/api/hqReadBounds.js"), "utf8");
const readCoordinator = readFileSync(resolve(root, "src/api/hqReadCoordinator.js"), "utf8");
const productionPage = readFileSync(resolve(root, "src/pages/ProductionReadinessDashboardPage.jsx"), "utf8");

const GOD_PAGE_THRESHOLD = 1500;

let failures = 0;
let warnings = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
  warnings += 1;
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

assert(/LARGEST_PAGE_COMPONENTS/.test(platformModel), "perf.largest_registry", "Largest pages documented");
assert(/HQ_ORDERS_LIST_DEFAULT_LIMIT|HQ_COLLECTIONS_AR_LIMIT/.test(hqBounds), "perf.bounded_reads", "hqReadBounds exists");
assert(/hqReadCoordinator|sharedReadBroker/.test(readCoordinator), "perf.read_coordinator", "Read coordinator/broker present");

const pagePaths = [
  "src/pages/CollectionsPage.jsx",
  "src/pages/AgentVisitPage.jsx",
  "src/pages/ExecutiveCompensationCenterPage.jsx",
];

for (const rel of pagePaths) {
  const abs = resolve(root, rel);
  const lines = readFileSync(abs, "utf8").split("\n").length;
  if (lines > GOD_PAGE_THRESHOLD) {
    warn(`perf.god.${rel}`, `${lines} LOC — decomposition deferred (documented)`);
  } else {
    pass(`perf.size.${rel}`, `${lines} LOC`);
  }
}

assert(/useMemo/.test(productionPage), "perf.readiness_memo", "Production Readiness dashboard uses useMemo");
assert(/lazy\(/.test(readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8")), "perf.lazy_routes", "Portal uses lazy route loading");

const measureScript = resolve(root, "scripts/measure-data-broker-duplicates.mjs");
try {
  statSync(measureScript);
  pass("perf.duplicate_measure", "measure-data-broker-duplicates.mjs exists");
} catch {
  warn("perf.duplicate_measure", "measure-data-broker-duplicates.mjs not found");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s), ${warnings} warn)\n`);
  process.exit(1);
}
console.log(`\nOverall: GO — performance readiness audit (${warnings} warn)\n`);
