#!/usr/bin/env node
/** RC2 — Responsive layout verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const grid = readFileSync(resolve(root, "src/components/ux/KpiCardGrid.jsx"), "utf8");
const layout = readFileSync(resolve(root, "src/styles/enterpriseLayout.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/grid-cols-2 lg:grid-cols/.test(grid), "grid.responsive", "responsive KPI grid");
assert(/xl:grid-cols-6|sm:grid-cols-2/.test(layout), "layout.responsive", "responsive enterprise grids");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — responsive layouts verified\n");
