#!/usr/bin/env node
/** Phase 9.3 — Collection compensation dashboard verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const modelSrc = readFileSync(resolve(root, "src/compensation/collectionCompensationModel.js"), "utf8");
const execSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");
const uiSrc = readFileSync(resolve(root, "src/components/peopleOps/CollectionCompensationDashboard.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildCollectionCompensationDashboard/.test(modelSrc), "model.builder", "collection compensation builder");
assert(/previewRows/.test(modelSrc), "model.preview_rows", "derives from preview rows");
assert(/intelligence\?\.employeeRows/.test(modelSrc), "model.intelligence", "reuses intelligence employee rows");
assert(/previewOnly:\s*true/.test(modelSrc), "model.readonly", "preview only flag");
assert(!/insert|update|delete|upsert/.test(modelSrc), "model.no_writes", "no mutation in model");
assert(/buildCollectionCompensationDashboard/.test(execSrc), "exec.wired", "attached in executive compensation model");
assert(/collectionCompensation/.test(execSrc), "exec.field", "collectionCompensation on model output");
assert(/CollectionCompensationDashboard/.test(uiSrc), "ui.component", "dashboard component exists");
assert(/collectionsManaged|collectionsReceived|commissionEarned|totalPayable/.test(uiSrc), "ui.columns", "required columns");
assert(/CollectionCompensationDashboard/.test(pageSrc), "page.wired", "wired on compensation center page");
assert(/model\.collectionCompensation/.test(pageSrc), "page.rows", "passes collection compensation rows");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — collection compensation verified\n");
