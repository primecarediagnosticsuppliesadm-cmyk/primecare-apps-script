#!/usr/bin/env node
/**
 * Sprint 3A observability framework verification.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const REQUIRED = [
  "src/observability/monitoring.js",
  "src/observability/healthEndpoint.js",
  "src/observability/readHealth.js",
  "src/components/ux/ReadHealthBanner.jsx",
];

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}

async function main() {
  console.log("\n=== Sprint 3A observability verification ===\n");

  for (const rel of REQUIRED) {
    const path = resolve(root, rel);
    if (!existsSync(path)) {
      fail(`missing ${rel}`);
    } else {
      pass(`module present — ${rel}`);
    }
  }

  const monitoring = readFileSync(resolve(root, "src/observability/monitoring.js"), "utf8");
  if (monitoring.includes("getCorrelationId") && monitoring.includes("logStructured")) {
    pass("monitoring abstraction — correlation ID + structured logging");
  } else {
    fail("monitoring.js incomplete");
  }

  if (monitoring.includes("VITE_SENTRY_DSN") && monitoring.includes("VITE_ALERT_WEBHOOK_URL")) {
    pass("monitoring placeholders — Sentry + alert webhook");
  } else {
    fail("monitoring config placeholders missing");
  }

  const health = readFileSync(resolve(root, "src/observability/healthEndpoint.js"), "utf8");
  if (health.includes("getHealthEndpointPayload")) {
    pass("health endpoint payload export");
  } else {
    fail("healthEndpoint.js incomplete");
  }

  const banner = readFileSync(resolve(root, "src/components/ux/ReadHealthBanner.jsx"), "utf8");
  if (banner.includes("readFailed") && banner.includes("degraded")) {
    pass("ReadHealthBanner surfaces readFailed/degraded");
  } else {
    fail("ReadHealthBanner incomplete");
  }

  const pages = [
    "src/pages/AdminDashboard.jsx",
    "src/pages/OperationsCommandCenter.jsx",
    "src/pages/ExecutiveFinancialIntelligencePage.jsx",
    "src/pages/ProjectionOperationsCenterPage.jsx",
  ];
  for (const rel of pages) {
    const src = readFileSync(resolve(root, rel), "utf8");
    if (src.includes("ReadHealthBanner")) {
      pass(`UI wired — ${rel}`);
    } else {
      fail(`ReadHealthBanner not wired in ${rel}`);
    }
  }

  const opsPlan = resolve(root, "docs/operations/HQ_MONITORING_PLAN.md");
  if (existsSync(opsPlan)) {
    pass("HQ_MONITORING_PLAN.md present (vendor wiring deferred)");
  }

  console.log("\n=== Observability verification complete ===\n");
}

main();
