#!/usr/bin/env node
/** RC2 — Founder OS UX verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const page = readFileSync(resolve(root, "src/pages/FounderOperatingSystemPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/Founder Command Center/.test(page), "founder.title", "command center title");
assert(/EnterpriseMetricStrip/.test(page), "founder.metric_strip", "top metric strip");
assert(/FounderPerformanceCards/.test(page), "founder.decision_cards", "performance decision cards");
assert(/compact/.test(page), "founder.compact_header", "compact page header");
assert(/space-y-3/.test(page), "founder.spacing", "reduced vertical spacing");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — Founder OS UX verified\n");
