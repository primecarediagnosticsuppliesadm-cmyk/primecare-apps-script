#!/usr/bin/env node
/**
 * RC2 regression — People Operations top-level model must render without ReferenceError.
 * Catches missing imports (e.g. filterAnalyticsLines) that break all People Ops tabs.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(
  /import\s*\{[^}]*filterAnalyticsLines[^}]*\}\s*from\s*["'].*analyticsExclusions/.test(modelSrc),
  "import.filterAnalyticsLines",
  "filterAnalyticsLines imported from analyticsExclusions"
);
assert(
  /filterAnalyticsLines\(/.test(modelSrc),
  "usage.filterAnalyticsLines",
  "filterAnalyticsLines used in executive compensation model"
);

try {
  const mod = await import(pathToFileURL(resolve(root, "src/compensation/executiveCompensationModel.js")).href);
  assert(typeof mod.buildExecutiveCompensationModel === "function", "export.builder", "buildExecutiveCompensationModel exported");

  const model = mod.buildExecutiveCompensationModel({
    payrollPeriods: [{ id: "p1", period_ym: "2026-01", status: "draft" }],
    payrollRuns: [],
    payrollPreviewLines: [],
    profiles: [],
    reportingSelection: { periodId: "p1" },
  });

  assert(model && typeof model === "object", "render.empty_payload", "model builds with empty payroll payload");
  assert(Array.isArray(model.previewRows), "render.preview_rows", "previewRows array present");
  assert(model.intelligence && typeof model.intelligence === "object", "render.intelligence", "intelligence object present");
  assert(model.kpis && typeof model.kpis === "object", "render.kpis", "kpis object present");
} catch (err) {
  fail("render.runtime", err?.message || String(err));
  failures += 1;
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — People Ops model render verified\n");
