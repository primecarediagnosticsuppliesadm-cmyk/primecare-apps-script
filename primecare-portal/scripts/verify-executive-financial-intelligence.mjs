#!/usr/bin/env node
/**
 * Executive Financial Intelligence — static wiring certification (read-only module).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function runStaticChecks() {
  console.log("\n--- Static wiring ---\n");

  const files = [
    "src/founder/executiveFinancialIntelligenceData.js",
    "src/founder/executiveFinancialIntelligenceEngine.js",
    "src/pages/ExecutiveFinancialIntelligencePage.jsx",
  ];
  for (const f of files) {
    if (existsSync(resolve(root, f))) pass(`EFI-file:${f}`, "present");
    else fail(`EFI-file:${f}`, "missing");
  }

  const engine = readSrc("src/founder/executiveFinancialIntelligenceEngine.js");
  if (
    engine.includes("computeRevenueMetrics") &&
    engine.includes("summarizeCollectionsList") &&
    engine.includes("buildInventoryEconomicsModel") === false &&
    engine.includes("computeLogisticsKpis") &&
    engine.includes("computeEstimatedDeliveryRevenue")
  ) {
    pass("EFI-10", "Engine composes existing KPI modules (no duplicate revenue core)");
  } else {
    fail("EFI-10", "Engine missing expected KPI imports");
  }

  const data = readSrc("src/founder/executiveFinancialIntelligenceData.js");
  if (
    data.includes("loadFounderFinancialIntelligenceData") &&
    data.includes("fetchPaymentsBoundedRows") &&
    !data.includes(".insert(") &&
    !data.includes(".update(")
  ) {
    pass("EFI-11", "Data loader is read-only and reuses FI bundle");
  } else {
    fail("EFI-11", "Data loader may contain writes or missing reuse");
  }

  const page = readSrc("src/pages/ExecutiveFinancialIntelligencePage.jsx");
  const sections = [
    "Revenue",
    "Collections",
    "Orders",
    "Logistics",
    "Inventory",
    "Lab Performance",
    "Executive Alerts",
  ];
  const missing = sections.filter((s) => !page.includes(s));
  if (!missing.length) pass("EFI-12", "All 7 dashboard sections present in UI");
  else fail("EFI-12", `Missing sections: ${missing.join(", ")}`);

  const matrix = readSrc("src/config/rolePermissionMatrix.js");
  if (matrix.includes("executiveFinancialIntelligence: [ROLES.EXECUTIVE]")) {
    pass("EFI-13", "Executive-only permission wired");
  } else {
    fail("EFI-13", "Permission matrix missing executiveFinancialIntelligence");
  }

  const portal = readSrc("src/PrimeCareWebPortal.jsx");
  if (portal.includes("ExecutiveFinancialIntelligencePage")) {
    pass("EFI-14", "Portal route wired");
  } else {
    fail("EFI-14", "Portal route missing");
  }

  const forbidden = [
    "src/api/primecareSupabaseApi.js",
    "src/api/invoiceSupabaseApi.js",
    "src/api/logisticsSupabaseApi.js",
    "src/api/deliveryChargeSupabaseApi.js",
  ];
  let isolationOk = true;
  for (const f of forbidden) {
    const before = readFileSync(resolve(root, f), "utf8");
    if (before.includes("executiveFinancialIntelligence")) {
      isolationOk = false;
      fail("EFI-15", `${f} modified for EFI (unexpected)`);
    }
  }
  if (isolationOk) pass("EFI-15", "Write APIs untouched by EFI module");
}

function runEngineSmoke() {
  console.log("\n--- Engine smoke ---\n");

  const engine = readSrc("src/founder/executiveFinancialIntelligenceEngine.js");
  if (
    engine.includes("export function buildExecutiveFinancialIntelligenceModel") &&
    engine.includes("buildExecutiveAlerts") &&
    engine.includes("buildRevenueTrend")
  ) {
    pass("EFI-20", "Model builder and section helpers exported in engine");
  } else {
    fail("EFI-20", "Engine exports incomplete");
  }

  if (engine.includes("OUTSTANDING_ALERT_THRESHOLD") && engine.includes("DELIVERY_FAILURE_ALERT_THRESHOLD")) {
    pass("EFI-21", "Executive alert thresholds defined in engine (not hardcoded in UI)");
  } else {
    fail("EFI-21", "Alert thresholds missing from engine");
  }
}

runStaticChecks();
runEngineSmoke();

const failed = results.filter((r) => r.status === "FAIL").length;
const passed = results.filter((r) => r.status === "PASS").length;
console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
