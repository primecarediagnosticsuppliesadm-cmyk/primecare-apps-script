#!/usr/bin/env node
/** Phase 9.3 — Founder performance decision cards verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const engineSrc = readFileSync(resolve(root, "src/founder/founderPerformanceCardsEngine.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/components/founder/FounderPerformanceCards.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/founder/founderWorkspaceModel.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/FounderOperatingSystemPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildFounderPerformanceCards/.test(engineSrc), "engine.builder", "performance cards engine");
assert(/Who generated the most revenue/.test(engineSrc), "card.revenue", "top revenue card");
assert(/Who generated the most collections/.test(engineSrc), "card.collections", "top collections card");
assert(/Who should be promoted/.test(engineSrc), "card.promotion", "promotion card");
assert(/Who needs intervention/.test(engineSrc), "card.intervention", "intervention card");
assert(!/openai|anthropic|gpt|llm|chatgpt/i.test(engineSrc), "guard.no_ai", "rule-based only");
assert(/FounderPerformanceCards/.test(uiSrc), "ui.component", "cards component");
assert(/buildFounderPerformanceCards/.test(modelSrc), "workspace.wired", "workspace composes cards");
assert(/performanceCards/.test(modelSrc), "workspace.field", "performanceCards on workspace");
assert(/FounderPerformanceCards/.test(pageSrc), "page.wired", "Founder OS renders cards");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — founder performance cards verified\n");
