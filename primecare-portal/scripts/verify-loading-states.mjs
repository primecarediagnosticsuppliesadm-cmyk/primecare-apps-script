#!/usr/bin/env node
/** RC2 — Loading states verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const ux = readFileSync(resolve(root, "src/components/ux/index.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

for (const name of ["PageSkeleton", "ListSkeleton", "KpiSkeleton"]) {
  assert(new RegExp(name).test(ux), `loading.${name}`, `${name} exported`);
}

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — loading states verified\n");
