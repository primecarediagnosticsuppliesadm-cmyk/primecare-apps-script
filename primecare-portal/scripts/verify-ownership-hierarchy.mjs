#!/usr/bin/env node
/** Phase 8.4 — Ownership hierarchy tree verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/ownership/businessOwnershipModel.js"), "utf8");
const treeSrc = readFileSync(resolve(root, "src/components/peopleOps/ownership/OwnershipExplorerTree.jsx"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/export function buildSalesOrgTree/.test(modelSrc), "model.tree_builder", "sales org tree builder exported");
assert(/type:\s*"executive"/.test(modelSrc), "model.executive_node", "executive node type");
assert(/type:\s*"admin"/.test(modelSrc), "model.admin_node", "admin node type");
assert(/type:\s*"agent"/.test(modelSrc), "model.agent_node", "agent node type");
assert(/type:\s*"lab"/.test(modelSrc), "model.lab_node", "lab leaf node type");
assert(/agentsByAdmin/.test(modelSrc), "model.admin_agent_map", "admin→agent grouping from labs");
assert(/OwnershipExplorerTree/.test(treeSrc), "ui.tree", "explorer tree component exists");
assert(/Expand all/.test(treeSrc), "ui.expand", "tree expand controls");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
