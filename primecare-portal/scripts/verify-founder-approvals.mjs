#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const model = readFileSync(resolve(root, "src/founder/founderWorkspaceModel.js"), "utf8");
const queue = readFileSync(resolve(root, "src/founder/founderDecisionQueueEngine.js"), "utf8");

let failures = 0;
function pass(id, d) { console.log(`PASS  ${id}: ${d}`); }
function fail(id, d) { console.error(`FAIL  ${id}: ${d}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildFounderApprovalsSection/.test(model), "approvals.section", "Approvals section in workspace model");
assert(/buildApprovalInbox/.test(model), "approvals.inbox_reuse", "Reuses buildApprovalInbox");
assert(/buildApprovalInbox/.test(queue), "approvals.queue_inbox", "Decision queue includes approval inbox");
assert(!/approvePayrollRun|lockPayrollRun/.test(model + queue), "boundary.no_engine", "No payroll workflow engine in founder layer");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO — founder approvals verified\n");
