#!/usr/bin/env node
/**
 * Sprint 1C — HQ Orders workspace simplification verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
const workspaceUiSrc = readFileSync(resolve(root, "src/orders/ordersWorkspaceUi.js"), "utf8");
const collapsibleSrc = readFileSync(
  resolve(root, "src/components/orders/OrdersCollapsibleSection.jsx"),
  "utf8"
);
const engineSrc = readFileSync(resolve(root, "src/orders/ordersOperationsQueueEngine.js"), "utf8");
const queueSrc = readFileSync(resolve(root, "src/components/hq/HqOrdersOperationsQueue.jsx"), "utf8");

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

assert(/ORDERS_WORKSPACE_PRIMARY_QUESTION/.test(workspaceUiSrc), "ia.primary_question", "primary question constant defined");
assert(/What order work needs my attention\?/.test(workspaceUiSrc), "ia.question_copy", "operational primary question copy");
assert(/ORDERS_WORKSPACE_PRIMARY_QUESTION/.test(pageSrc), "ia.header_wired", "page header uses primary question");
assert(/data-orders-workspace="hq"/.test(pageSrc), "ia.workspace_marker", "single HQ workspace marker (no split)");
assert(!/resolveOrdersWorkspace/.test(pageSrc), "ia.no_persona_split", "no persona workspace resolver");

assert(/OrdersCollapsibleSection/.test(collapsibleSrc), "collapse.component", "collapsible section component exists");
assert(/Order portfolio summary/.test(pageSrc), "collapse.portfolio", "KPI portfolio collapsed under summary");
assert(/Order metadata/.test(pageSrc), "collapse.metadata", "order metadata collapsed");
assert(/Activity and notes/.test(pageSrc), "collapse.activity", "activity/notes collapsed");

const kpiGridIdx = pageSrc.indexOf("<KpiCardGrid");
const startHereIdx = pageSrc.indexOf("Start here and order queues");
const queueIdx = pageSrc.indexOf('aria-label="Order queue"');
assert(kpiGridIdx > 0 && startHereIdx > 0 && kpiGridIdx > startHereIdx, "budget.kpi_after_start", "KPI grid appears after Start Here region");
assert(/OrdersCollapsibleSection title="Order portfolio summary"[\s\S]*KpiCardGrid/.test(pageSrc), "budget.kpi_inside_collapse", "KPI grid nested in collapsible portfolio");

assert(/getOrdersExpectedActionCopy/.test(pageSrc), "discover.expected_action", "expected action copy wired");
assert(/Expected:/.test(pageSrc), "discover.expected_label", "expected action visible in detail");
assert(/aria-label="Status actions"/.test(pageSrc), "discover.status_actions_region", "status actions labeled");

const statusActionMatches = pageSrc.match(/Status Actions/g) || [];
assert(statusActionMatches.length === 1, "discover.single_status_actions", "Status Actions appears once (not duplicated)");

assert(/ActionErrorSummary/.test(pageSrc), "sprint1a.errors_local", "Sprint 1A ActionErrorSummary retained");
assert(/statusMutationError/.test(pageSrc), "sprint1a.mutation_state", "Sprint 1A mutation error state retained");
assert(/OrdersContextStrip/.test(pageSrc), "sprint1b.strip", "Sprint 1B context strip retained");
assert(/Start here/i.test(queueSrc), "sprint1b.start_here", "Sprint 1B Start Here retained");

assert(/isAwaitingFulfillment/.test(engineSrc), "queue.math_untouched", "queue engine predicates present");
assert(/buildOrdersOperationsQueue/.test(engineSrc), "queue.builder_untouched", "queue builder unchanged surface");
assert(!/createOrderWrite/.test(pageSrc), "scope.no_checkout", "no checkout write path on Orders page");

assert(!/Suggested next actions[\s\S]{0,200}Pending orders/.test(pageSrc), "empty.no_mini_kpi", "empty detail no longer stacks mini KPI tiles before suggestions");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — orders workspace simplification verified\n");
