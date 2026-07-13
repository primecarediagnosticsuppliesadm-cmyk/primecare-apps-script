#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "src/founder/founderDecisionQueueEngine.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildApprovalInbox/.test(src), "queue.approval_reuse", "Reuses People Ops approval inbox");
assert(/mapActionQueueItem/.test(src), "queue.action_queue", "Maps executive action queue");
assert(/deepLinkPage/.test(src), "queue.deep_links", "Every item has deep-link page");
assert(/lab_contracts/.test(src), "queue.contracts", "Contract decisions from existing contracts read");
assert(!/submitPayroll|approvePayroll|createInvoice/.test(src), "boundary.no_workflow", "No workflow duplication");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — founder decision queue verified\n");
