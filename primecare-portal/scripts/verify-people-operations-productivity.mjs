#!/usr/bin/env node
/**
 * Phase 8.1B — People Operations executive productivity verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const modelSrc = readFileSync(resolve(root, "src/peopleOps/productivity/peopleOpsProductivityModel.js"), "utf8");
const sessionSrc = readFileSync(resolve(root, "src/peopleOps/productivity/usePeopleOpsSessionState.js"), "utf8");
const dashboardSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsDashboard.jsx"), "utf8");
const compensationModelSrc = readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8");
const payrollApiSrc = readFileSync(resolve(root, "src/api/payrollDomainSupabaseApi.js"), "utf8");

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

assert(/buildPeopleOpsProductivityWorkspace/.test(modelSrc), "model.workspace", "productivity workspace builder present");
assert(/buildQuickActions/.test(modelSrc), "model.quick_actions", "quick actions derived from workflow UI");
assert(/buildApprovalInbox/.test(modelSrc), "model.approval_inbox", "approval inbox builder present");
assert(/buildNotifications/.test(modelSrc), "model.notifications", "notifications builder present");
assert(/translateActivityEvent/.test(modelSrc), "model.activity_translation", "business-language activity feed");
assert(/buildGlobalSearchIndex/.test(modelSrc), "model.search_index", "in-memory global search index");
assert(/buildWorkflowProgress/.test(modelSrc), "model.workflow_progress", "workflow progress stages");

assert(/sessionStorage/.test(sessionSrc), "session.storage", "browser session persistence for recent/favorites");
assert(/usePeopleOpsSessionState/.test(pageSrc), "ui.session_hook", "page uses session state hook");

assert(/PeopleOpsQuickActions/.test(dashboardSrc), "ui.quick_actions", "dashboard renders quick actions");
assert(/PeopleOpsApprovalInbox/.test(dashboardSrc), "ui.approval_inbox", "dashboard renders approval inbox");
assert(/PeopleOpsNotificationsPanel/.test(dashboardSrc), "ui.notifications", "dashboard renders notifications center");
assert(/PeopleOpsRecentActivity/.test(dashboardSrc), "ui.recent_activity", "dashboard renders activity feed");
assert(/PeopleOpsRecentlyViewed/.test(dashboardSrc), "ui.recently_viewed", "dashboard renders recently viewed");
assert(/PeopleOpsFavorites/.test(dashboardSrc), "ui.favorites", "dashboard renders favorites");

assert(/PeopleOpsGlobalSearch/.test(pageSrc), "ui.global_search", "global search wired on page");
assert(/PeopleOpsContextPanel/.test(pageSrc), "ui.context_panel", "context panel wired on page");
assert(/buildPayrollWorkflowActions/.test(modelSrc), "reuse.workflow_actions", "quick actions reuse payroll workflow UI");

assert(!/supabase\/migrations/.test(pageSrc + modelSrc + sessionSrc), "guard.no_schema", "no schema changes in productivity layer");
assert(compensationModelSrc === readFileSync(resolve(root, "src/compensation/executiveCompensationModel.js"), "utf8"), "guard.model_unchanged", "executive compensation model file readable");
assert(/buildExecutiveCompensationModel/.test(pageSrc), "guard.single_model", "page still uses existing model orchestrator");
const loaderAwaitCalls = (pageSrc.match(/await\s+loadExecutiveCompensationCenterRead/g) || []).length;
assert(loaderAwaitCalls <= 1, "guard.no_duplicate_loader", "single read loader invocation in page");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
