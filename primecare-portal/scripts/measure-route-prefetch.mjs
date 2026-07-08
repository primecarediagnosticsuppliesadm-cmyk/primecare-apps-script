#!/usr/bin/env node
/**
 * Sprint 7A — route prefetch alignment probe.
 *
 * Read-only static import check: verifies idle route prefetch targets match role routing
 * and do not include predator/debug/QA-heavy pages by default.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const asJson = process.argv.includes("--json");

const EXPECTED = {
  admin: ["dashboard", "orders", "labs", "collections", "logisticsDelivery"],
  executive: ["executiveFinancialIntelligence", "operationsCenter", "projectionOpsCenter"],
  agent: ["dashboard", "collections", "visits"],
  lab: ["labOrders", "labInvoices"],
};

const FORBIDDEN_DEFAULT = new Set([
  "predatorDebug",
  "qaCommandCenter",
  "performance",
  "insights",
]);

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function roleTargets(prefetchMap, role) {
  const map = prefetchMap[role] || {};
  return unique(Object.keys(map).flatMap((key) => [key, ...(map[key] || [])]));
}

function result(status, id, detail) {
  return { status, id, detail };
}

function printRows(rows) {
  for (const row of rows) {
    const line = `${row.status.padEnd(5)} ${row.id}: ${row.detail}`;
    if (row.status === "FAIL") console.error(line);
    else if (row.status === "WARN") console.warn(line);
    else console.log(line);
  }
}

async function main() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const mod = await server.ssrLoadModule("/src/utils/routePrefetch.js");
    const prefetchMap = mod.PREFETCH_BY_ROLE || {};
    const pageLoaders = mod.PAGE_LOADERS || {};
    const rows = [];

    for (const [role, expectedTargets] of Object.entries(EXPECTED)) {
      const targets = roleTargets(prefetchMap, role);
      const missing = expectedTargets.filter((target) => !targets.includes(target));
      const forbidden = targets.filter((target) => FORBIDDEN_DEFAULT.has(target));
      const missingLoaders = targets.filter(
        (target) => target !== "dashboard" && typeof pageLoaders[target] !== "function"
      );

      rows.push(
        missing.length
          ? result("FAIL", `${role}.targets`, `missing ${missing.join(", ")}`)
          : result("PASS", `${role}.targets`, `covers ${expectedTargets.join(", ")}`)
      );
      rows.push(
        forbidden.length
          ? result("FAIL", `${role}.forbidden`, `default prefetch includes ${forbidden.join(", ")}`)
          : result("PASS", `${role}.forbidden`, "no predator/debug/QA-heavy defaults")
      );
      rows.push(
        missingLoaders.length
          ? result("FAIL", `${role}.loaders`, `missing loaders ${missingLoaders.join(", ")}`)
          : result("PASS", `${role}.loaders`, "all target chunks have loaders")
      );
    }

    const failed = rows.filter((row) => row.status === "FAIL");
    if (asJson) {
      console.log(JSON.stringify({ rows, ok: failed.length === 0 }, null, 2));
    } else {
      console.log("\n# Route prefetch alignment\n");
      printRows(rows);
      console.log(failed.length ? "\nNO-GO: route prefetch drift detected." : "\nGO: route prefetch aligned.");
    }
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error("FAIL  measure-route-prefetch:", err?.message || err);
  process.exit(1);
});
