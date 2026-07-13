#!/usr/bin/env node
/**
 * Phase 5A compensation plan versioning verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  nextPlanVersionLabel,
  shouldVersionOnEdit,
  COMPENSATION_PLAN_STATUSES,
} from "../src/compensation/compensationPlanAdminWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/compensationPlanAdminSupabaseApi.js"), "utf8");
const workflowSrc = readFileSync(resolve(root, "src/compensation/compensationPlanAdminWorkflow.js"), "utf8");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

assert(nextPlanVersionLabel("v1") === "v2", "version.next", "v1 -> v2");
assert(nextPlanVersionLabel("v7") === "v8", "version.increment", "v7 -> v8");
assert(shouldVersionOnEdit({ status: COMPENSATION_PLAN_STATUSES.ACTIVE }), "version.active_edit", "active edit requires version");
assert(!shouldVersionOnEdit({ status: COMPENSATION_PLAN_STATUSES.DRAFT }), "version.draft_edit", "draft can edit in place");
assert(/createCompensationPlanVersion/.test(apiSrc), "api.create_version", "version create API present");
assert(/active_plan_requires_new_version/.test(apiSrc), "api.active_guard", "active plan guarded from in-place edit");
assert(/assignments_preserved/.test(apiSrc), "api.assignments_preserved", "version audit notes assignment preservation");
assert(/versionHistory/.test(workflowSrc), "workflow.version_history", "version history helper present");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
