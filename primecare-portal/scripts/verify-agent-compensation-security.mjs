#!/usr/bin/env node
/**
 * Phase 5B Agent Compensation 360 role security verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentCompensation360Permissions,
  assertAgentCompensation360Access,
} from "../src/compensation/agentCompensation360Workflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const roleMatrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/employeeCompensation360SupabaseApi.js"), "utf8");
const panelSrc = readFileSync(
  resolve(root, "src/components/compensation/EmployeeCompensation360Panel.jsx"),
  "utf8"
);

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
function assertThrows(fn, id, detail) {
  try {
    fn();
    fail(id, detail);
  } catch {
    pass(id, detail);
  }
}

const executive = agentCompensation360Permissions("executive");
const hr = agentCompensation360Permissions("hr");
const admin = agentCompensation360Permissions("admin");
const agent = agentCompensation360Permissions("agent");
const lab = agentCompensation360Permissions("lab");
const distributor = agentCompensation360Permissions("distributor");

assert(executive.canView360 && executive.canChangePlan && executive.canReviewHistory, "role.executive", "Executive full 360 view and plan change");
assert(hr.canView360 && hr.canChangePlan && hr.hrNoRuleEditing, "role.hr", "HR can view and assign plan only");
assert(admin.canView360 && admin.adminReadOnly && !admin.canChangePlan, "role.admin", "Admin view-only");
assert(agent.employeeOwnProfileOnly && !agent.canChangePlan, "role.agent_future", "Agent own-profile contract declared");
assert(!lab.canView360, "role.lab", "Lab has no 360 access");
assert(!distributor.canView360, "role.distributor", "Distributor has no 360 access");

assertThrows(
  () => assertAgentCompensation360Access("lab", { targetProfileUserId: "u1" }),
  "guard.lab",
  "Lab access blocked"
);
assertThrows(
  () => assertAgentCompensation360Access("agent", { actorAgentId: "A2", targetAgentId: "A1", actorProfileUserId: "u2", targetProfileUserId: "u1" }),
  "guard.agent_other",
  "Agent cannot view other profiles"
);
assert(
  assertAgentCompensation360Access("agent", { actorAgentId: "A1", targetAgentId: "A1", actorProfileUserId: "u1", targetProfileUserId: "u1" }),
  "guard.agent_own",
  "Agent can view own profile contract"
);

assert(/permissions\?\.canChangePlan/.test(panelSrc), "ui.plan_guard", "change plan gated by permissions");
assert(/assertEmployeeCompensation360Access/.test(apiSrc), "api.guard", "360 API enforces access guard");
assert(/compensationPayroll:\s*\[ROLES\.EXECUTIVE,\s*ROLES\.HR,\s*ROLES\.ADMIN\]/.test(roleMatrix), "matrix.page_access", "page access limited to Executive/HR/Admin");
assert(!/from\("(payments|orders|invoices|ar_credit_control)"\)\s*\.(update|insert|delete|upsert)/.test(apiSrc), "api.no_finance_writes", "360 API does not mutate finance");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
