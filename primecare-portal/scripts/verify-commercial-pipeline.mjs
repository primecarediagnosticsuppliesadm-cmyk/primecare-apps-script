#!/usr/bin/env node
/** Phase 9.0 — Commercial pipeline verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/commercial/commercialWorkspaceModel.js"), "utf8");
const pipelineSrc = readFileSync(resolve(root, "src/utils/qualificationPipeline.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/COMMERCIAL_PIPELINE_STAGES/.test(modelSrc), "model.stages", "commercial stage rail");
assert(/export function buildCommercialPipelineBoard/.test(modelSrc), "model.board", "pipeline board builder");
assert(/daysInStage/.test(modelSrc), "model.days", "days in stage");
assert(/normalizeQualificationPipelineStage/.test(modelSrc), "reuse.pipeline", "reuses qualification pipeline utils");
assert(/PIPELINE_STAGES/.test(pipelineSrc), "sot.pipeline", "canonical qualification stages intact");
assert(/sample_sent/.test(modelSrc) && /negotiation/.test(modelSrc), "map.stages", "maps sample/negotiation stages");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
