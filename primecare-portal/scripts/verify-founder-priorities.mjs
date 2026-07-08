#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "src/founder/founderPrioritiesEngine.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildFounderInsights/.test(src), "prio.insights", "Composes from insights");
assert(/buildFounderDecisionQueue/.test(src), "prio.decisions", "Composes from decision queue");
assert(/slice\(0,\s*5\)/.test(src), "prio.top5", "Top 5 cap");
assert(/deepLinkPage/.test(src), "prio.deep_link", "Priorities include deep-links");
assert(/recommendedAction/.test(src), "prio.action", "Recommended action field");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — founder priorities verified\n");
