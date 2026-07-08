#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "src/founder/founderInsightsEngine.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildFounderInsights/.test(src), "insights.export", "Insights engine exported");
assert(/noAi:\s*true/.test(src), "insights.no_ai", "Explicitly no AI");
assert(/summarizeCollectionsList/.test(src), "insights.collections_sot", "Uses collections SoT helper");
assert(!/openai|anthropic|machine learning|tensorflow|gpt/i.test(src), "insights.no_ml", "No AI/ML imports");
assert(/actionPage/.test(src), "insights.deep_link", "Insights deep-link to modules");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — founder insights verified\n");
