#!/usr/bin/env node
/**
 * Phase 5A compensation administration role security verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compensationAdminPermissions } from "../src/compensation/compensationPlanAdminWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const roleMatrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
const workflowSrc = readFileSync(resolve(root, "src/compensation/compensationPlanAdminWorkflow.js"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/compensationPlanAdminSupabaseApi.js"), "utf8");

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

const executive = compensationAdminPermissions("executive");
const hr = compensationAdminPermissions("hr");
const admin = compensationAdminPermissions("admin");
const agent = compensationAdminPermissions("agent");

assert(executive.canCreatePlan && executive.canDeactivatePlan && executive.canCreatePlanVersion, "role.executive_full", "Executive has full plan admin");
assert(hr.canAssignPlan && hr.canChangePlan && !hr.canCreatePlan && !hr.canDeactivatePlan, "role.hr_limited", "HR can assign but not edit rules/deactivate");
assert(admin.canViewPlans && admin.canSimulate && !admin.canAssignPlan && admin.adminReadOnly, "role.admin_read", "Admin is read-only");
assert(agent.agentOwnPlanOnly && !agent.canCreatePlan, "role.agent_own", "Agent limited to own plan visibility contract");
assert(/compensationPayroll:\s*\[ROLES\.EXECUTIVE,\s*ROLES\.HR,\s*ROLES\.ADMIN\]/.test(roleMatrix), "matrix.page_access", "Executive Compensation page allows Executive/HR/Admin");
assert(/assertCompensationAdminAction/.test(apiSrc), "api.action_guard", "API enforces admin action guards");
assert(/hrCannotEditCommissionRules/.test(workflowSrc), "workflow.hr_rule_lock", "HR commission rule lock declared");
assert(!/from\("(payments|orders|invoices)"\)\s*\.(update|insert|delete|upsert)/.test(apiSrc), "api.no_o2c_writes", "admin API does not mutate O2C");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
