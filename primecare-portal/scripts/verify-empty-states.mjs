#!/usr/bin/env node
/** RC2 — Empty states verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const empty = readFileSync(resolve(root, "src/components/ux/EmptyState.jsx"), "utf8");
const table = readFileSync(resolve(root, "src/components/ux/EnterpriseDataTable.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export default function EmptyState/.test(empty), "empty.component", "EmptyState component");
assert(/emptyTitle|emptyDescription/.test(table), "table.empty_props", "EnterpriseDataTable empty props");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — empty states verified\n");
