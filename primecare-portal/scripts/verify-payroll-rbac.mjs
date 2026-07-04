#!/usr/bin/env node
/**
 * Phase 3C payroll RBAC verification.
 * Read-only/unit + static source checks for app-layer and SQL RLS hardening.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYROLL_ACTIONS,
  canPerformPayrollAction,
  assertPayrollReadAccess,
  isPayrollAgentVisibleStatus,
} from "../src/payroll/payrollDomainWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");
const workflowSrc = readFileSync(resolve(root, "src/payroll/payrollDomainWorkflow.js"), "utf8");
const hardeningSrc = readFileSync(
  resolve(root, "supabase/migrations/20260706131000_payroll_domain_rls_hardening.sql"),
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

for (const action of [
  PAYROLL_ACTIONS.PREVIEW,
  PAYROLL_ACTIONS.SUBMIT,
  PAYROLL_ACTIONS.APPROVE,
  PAYROLL_ACTIONS.REJECT,
  PAYROLL_ACTIONS.LOCK,
  PAYROLL_ACTIONS.EXPORT,
  PAYROLL_ACTIONS.PAY,
  PAYROLL_ACTIONS.REOPEN,
]) {
  assert(canPerformPayrollAction("executive", action), `executive.${action}`, `executive can ${action}`);
}
assert(canPerformPayrollAction("hr", PAYROLL_ACTIONS.PREVIEW), "hr.preview", "HR can preview");
assert(canPerformPayrollAction("hr", PAYROLL_ACTIONS.SUBMIT), "hr.submit", "HR can submit");
for (const action of [
  PAYROLL_ACTIONS.APPROVE,
  PAYROLL_ACTIONS.REJECT,
  PAYROLL_ACTIONS.LOCK,
  PAYROLL_ACTIONS.EXPORT,
  PAYROLL_ACTIONS.PAY,
  PAYROLL_ACTIONS.REOPEN,
]) {
  assert(!canPerformPayrollAction("hr", action), `hr.block.${action}`, `HR cannot ${action}`);
  assert(!canPerformPayrollAction("admin", action), `admin.block.${action}`, `admin cannot ${action}`);
  assert(!canPerformPayrollAction("agent", action), `agent.block.${action}`, `agent cannot ${action}`);
}
assert(canPerformPayrollAction("admin", PAYROLL_ACTIONS.READ), "admin.read", "admin view/recommend only");
assert(canPerformPayrollAction("agent", PAYROLL_ACTIONS.READ), "agent.read", "agent read only");
assert(
  assertPayrollReadAccess({
    role: "agent",
    runStatus: "locked",
    actorAgentId: "A1",
    rowAgentId: "A1",
  }),
  "agent.own_locked_read",
  "agent can read own locked row"
);
assert(
  assertPayrollReadAccess({
    role: "agent",
    runStatus: "paid",
    actorAgentId: "A1",
    rowAgentId: "A1",
  }),
  "agent.own_paid_read",
  "agent can read own paid row"
);
assert(isPayrollAgentVisibleStatus("paid"), "agent.paid_visible_status", "paid is agent-visible status");
assertThrows(
  () =>
    assertPayrollReadAccess({
      role: "agent",
      runStatus: "submitted",
      actorAgentId: "A1",
      rowAgentId: "A1",
    }),
  "agent.no_submitted_read",
  "agent cannot read submitted row"
);

assert(/assertPayrollPermission/.test(apiSrc), "api.permission_checks", "API uses domain permission checks");
assert(/ACTION_PERMISSION_BY_ROLE/.test(workflowSrc), "domain.matrix", "domain RBAC matrix is centralized");

assert(
  /lower\(COALESCE\(row_status, ''\)\) IN \('locked', 'exported', 'paid'\)/.test(hardeningSrc),
  "rls.agent_paid_visibility",
  "SQL agent helper includes paid"
);
assert(/enforce_payroll_workflow_rbac/.test(hardeningSrc), "rls.workflow_trigger", "workflow RBAC trigger present");
assert(/payroll_runs_update_hr/.test(hardeningSrc), "rls.hr_run_update", "HR run update policy split");
assert(/payroll_runs_update_executive/.test(hardeningSrc), "rls.executive_run_update", "Executive run update policy split");
assert(
  !/CREATE POLICY payroll_runs_update\s+ON public\.payroll_runs/.test(hardeningSrc),
  "rls.no_broad_run_update",
  "broad payroll run update policy removed"
);
assert(
  /v_role IN \('admin', 'agent'/.test(hardeningSrc) &&
    /payroll_workflow_update_forbidden_for_%/.test(hardeningSrc),
  "rls.admin_blocked",
  "admin direct workflow updates blocked by trigger"
);
assert(
  /payroll_adjustment_approval_executive_only/.test(hardeningSrc),
  "rls.adjustment_exec_only",
  "adjustment approval is executive-only at DB layer"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
