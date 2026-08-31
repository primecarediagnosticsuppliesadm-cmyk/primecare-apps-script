#!/usr/bin/env node
/**
 * Agent Resources AR-1C agent consumer access (static).
 * Live visibility/named/archive tests: --remote against QA only.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function src(rel) {
  const path = resolve(root, rel);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

let failures = 0;
function pass(id, d) {
  console.log(`PASS  ${id}: ${d}`);
}
function fail(id, d) {
  console.error(`FAIL  ${id}: ${d}`);
  failures += 1;
}
function skip(id, d) {
  console.log(`SKIP  ${id}: ${d}`);
}
function assert(c, id, d) {
  if (c) pass(id, d);
  else fail(id, d);
}

const api = src("src/api/agentResourceSupabaseApi.js");
const bounds = src("src/api/hqReadBounds.js");
const page = src("src/pages/AgentResourcesPage.jsx");
const publisher = src("src/pages/AgentResourcesPublisherPage.jsx");
const portal = src("src/PrimeCareWebPortal.jsx");
const menu = src("src/config/menuConfig.js");
const perms = src("src/config/rolePermissionMatrix.js");
const hr = src("src/peopleOps/employee360/peopleOpsHrModuleConfig.js");

assert(page.length > 0, "page.exists", "AgentResourcesPage present");
assert(/listAgentResourcesAgentRead/.test(api), "api.list", "agent list read");
assert(/acknowledgeAgentResourceVersionWrite/.test(api), "api.ack", "acknowledgement write");
assert(/getAgentResourceSignedUrl/.test(api), "api.signed_reuse", "signed URL helper reused");
assert(/HQ_AGENT_RESOURCE_AGENT_LIST_COLUMNS/.test(bounds), "bounds.agent_list", "agent list columns bounded");
assert(!/select\(\s*["']\*["']\s*\)/.test(api), "api.no_select_star", "no SELECT *");
assert(!/getPublicUrl/.test(page) && !/getPublicUrl/.test(api), "api.no_public", "no getPublicUrl");
assert(!/storage_path/.test(page), "ui.no_storage_path", "consumer UI does not show storage path");
assert(!/New Resource/.test(page), "ui.no_new", "no New Resource");
assert(!/New Version/.test(page) && !/Confirm publish/.test(page), "ui.no_publish", "no publish/new version");
assert(!/Confirm archive/.test(page) && !/\bArchive\b/.test(page), "ui.no_archive", "no Archive action");
assert(!/audience/i.test(page), "ui.no_audience", "no audience controls");
assert(/Mark as Read/.test(page), "ui.mark_read", "explicit Mark as Read");
assert(/max-w-lg/.test(page), "ui.mobile_width", "narrow agent layout");
assert(!/<table/.test(page), "ui.no_table", "no desktop table");
assert(/agentResources: \[ROLES\.EXECUTIVE, ROLES\.ADMIN, ROLES\.AGENT\]/.test(perms), "perm.agent", "Agent permitted");
assert(!/agentResources: \[[^\]]*ROLES\.LAB/.test(perms), "perm.no_lab", "Lab denied");
assert(!/agentResources: \[[^\]]*ROLES\.HR/.test(perms), "perm.no_hr", "HR denied");
assert(/AGENT_MENU_ORDER = \["dashboard", "visits", "agentResources"/.test(menu), "menu.agent", "Resources in agent menu");
assert(/label: "Resources"/.test(menu), "menu.label", "agent label Resources");
assert(/LAB_MENU_ORDER = \["labOrders", "labInvoices", "labAccount"\]/.test(menu), "menu.no_lab", "Lab menu unchanged");
assert(/AgentResourcesPage/.test(portal), "route.agent", "agent consumer routed");
assert(/ROLES\.AGENT[\s\S]*AgentResourcesPage/.test(portal), "route.agent_switch", "Agent role uses consumer page");
assert(/AgentResourcesPublisherPage/.test(publisher) || /New Resource/.test(publisher), "route.publisher_intact", "publisher page unchanged for HQ");
assert(/PEOPLE_OPS_HR_MODULE_ENABLED = false/.test(hr), "hr.gate", "People Ops HR module remains off");
assert(!/localStorage/.test(page), "ui.no_localstorage", "ack is not localStorage");

if (!process.argv.includes("--remote")) {
  skip("live.access", "pass --remote after QA apply; static agent access contract verified above");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Resources agent access contract (static)\n");

if (process.argv.includes("--remote")) {
  const { runLiveAgentAccess, finishLive } = await import("./lib/agentResourcesLiveQa.mjs");
  const live = await runLiveAgentAccess();
  finishLive("Agent Resources agent access", live);
  if (live.failures || live.criticalSkips) process.exit(process.exitCode || 1);
}
