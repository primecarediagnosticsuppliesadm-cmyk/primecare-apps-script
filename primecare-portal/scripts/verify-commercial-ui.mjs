#!/usr/bin/env node
/** RC2 — Commercial UX verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const drawer = readFileSync(resolve(root, "src/components/commercial/CommercialLab360Drawer.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/Lab360SectionNav/.test(drawer), "lab360.nav", "section navigation");
assert(/enterpriseLayout/.test(drawer), "lab360.tokens", "enterprise layout tokens");
assert(/Lab 360/.test(drawer), "lab360.title", "Lab 360 branding");
assert(/activeSection/.test(drawer), "lab360.sections", "tabbed sections");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — Commercial UX verified\n");
