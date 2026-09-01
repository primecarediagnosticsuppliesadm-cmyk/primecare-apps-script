#!/usr/bin/env node
/**
 * Agent Resources AR-1B publisher workflow verification (static).
 * Live publisher mutations run only with --remote against QA (never Production).
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
const page = src("src/pages/AgentResourcesPublisherPage.jsx");
const portal = src("src/PrimeCareWebPortal.jsx");
const menu = src("src/config/menuConfig.js");
const perms = src("src/config/rolePermissionMatrix.js");
const routing = src("src/config/pageRouting.js");
const prefetch = src("src/utils/routePrefetch.js");
const hr = src("src/peopleOps/employee360/peopleOpsHrModuleConfig.js");
const visits = src("src/pages/AgentVisitPage.jsx");
const collections = src("src/pages/CollectionsPage.jsx");
const orders = src("src/pages/OrdersPage.jsx");

assert(api.length > 0, "api.exists", "agentResourceSupabaseApi.js present");
assert(page.length > 0, "page.exists", "AgentResourcesPublisherPage present");
assert(/listAgentResourcesPublisherRead/.test(api), "api.list", "publisher list");
assert(/getAgentResourceDetailPublisherRead/.test(api), "api.detail", "publisher detail");
assert(/createAgentResourceWrite/.test(api), "api.create", "create resource");
assert(/createAgentResourceVersionWrite/.test(api), "api.new_version", "new version");
assert(/updateAgentResourceMetadataWrite/.test(api), "api.metadata", "metadata edit");
assert(/replaceAgentResourceAudienceWrite/.test(api), "api.audience", "audience replace");
assert(/publishAgentResourceVersionWrite/.test(api), "api.publish", "publish write");
assert(/archiveAgentResourceWrite/.test(api), "api.archive", "archive write");
assert(/getAgentResourceSignedUrl/.test(api), "api.signed", "signed URL");
assert(/rpc\(["']publish_agent_resource_version["']/.test(api), "api.publish_rpc", "publish calls certified RPC");
assert(!/\.update\(\s*\{\s*status/.test(api), "api.no_status_update", "no client version status update");
assert(!/current_published_version_id\s*:/.test(api.replace(/HQ_AGENT_RESOURCE_LIST_COLUMNS[\s\S]*?;/, "")), "api.no_pointer_write", "does not write current_published_version_id");
assert(!/getPublicUrl/.test(api) && !/getPublicUrl/.test(page), "api.no_public_url", "no getPublicUrl");
assert(!/select\(\s*["']\*["']\s*\)/.test(api), "api.no_select_star", "no SELECT *");
assert(!/operationalEvidenceApi/.test(api) && !/operationalEvidenceApi/.test(page), "api.no_evidence", "no operationalEvidenceApi");
assert(!/invoice-pdfs/.test(api) && !/operational-evidence/.test(api), "api.no_foreign_bucket", "does not use invoice-pdfs or operational-evidence");
assert(/AGENT_RESOURCES_BUCKET = ["']agent-resources["']/.test(api), "api.bucket", "bucket agent-resources");
assert(/HQ_AGENT_RESOURCE_SIGNED_URL_TTL_SEC = 300/.test(bounds), "bounds.ttl", "signed URL TTL 300");
assert(/HQ_AGENT_RESOURCE_LIST_COLUMNS/.test(bounds), "bounds.list", "list columns bounded");
assert(/HQ_AGENT_RESOURCE_ACK_COLUMNS/.test(bounds), "bounds.ack", "ack roster columns bounded");
assert(/inspectAgentResourceFile/.test(api), "api.file_inspect", "client file inspection");
assert(/docx/i.test(api), "api.reject_docx", "DOCX rejected");
assert(/10485760|HQ_AGENT_RESOURCE_MAX_FILE_BYTES/.test(api), "api.max_size", "10 MiB cap");
assert(/named_agents/.test(api) && /all_agents/.test(api), "api.audience_types", "All Agents and Named Agents");
assert(/eq\(["']role["'], ["']agent["']\)/.test(api), "api.named_agents_only", "named picker is active agents");
assert(/eq\(["']active["'], true\)/.test(api), "api.active_only", "inactive users excluded from picker");

assert(/agentResources: \[ROLES\.EXECUTIVE, ROLES\.ADMIN, ROLES\.AGENT\]/.test(perms), "perm.exec_admin_agent", "Executive + Admin + Agent permission");
assert(/agentResources: \[[^\]]*ROLES\.AGENT/.test(perms), "perm.agent", "Agent permitted for consumer page");
assert(!/agentResources: \[[^\]]*ROLES\.LAB/.test(perms), "perm.no_lab", "Lab not permitted");
assert(!/agentResources: \[[^\]]*ROLES\.HR/.test(perms), "perm.no_hr", "HR not permitted");
assert(/key: ["']agentResources["']/.test(menu), "menu.item", "MENU_ITEMS includes publisher");
assert(/AGENT_MENU_ORDER = \["dashboard", "visits", "agentResources", "labs", "collections"\]/.test(menu), "menu.agent_resources", "Agent menu includes Resources");
assert(/LAB_MENU_ORDER = \["labOrders", "labInvoices", "labAccount"\]/.test(menu), "menu.no_lab", "Lab menu unchanged");
assert(/keys: \[[^\]]*agentResources/.test(menu), "menu.hq_section", "HQ OPERATIONS section includes publisher");
assert(/"agentResources"/.test(menu.split("PILOT_SAFE_PAGE_KEYS")[1] || ""), "menu.pilot_safe", "pilot-safe so QA/PROD sidebar shows it");
assert(/case ["']agentResources["']/.test(portal), "route.mapped", "portal routes publisher page");
assert(/AgentResourcesPublisherPage/.test(portal), "route.component", "shared publisher page");
assert(/AgentResourcesPage/.test(portal), "route.agent_consumer", "agent consumer page routed");
assert(/agent-resources/.test(routing), "route.alias", "agent-resources alias");
assert(/PAGE_LOADERS[\s\S]*agentResources:/.test(prefetch), "prefetch.loader", "lazy loader registered");
assert(!/PREFETCH_BY_ROLE[\s\S]*agentResources/.test(prefetch.split("export const PAGE_LOADERS")[0]), "prefetch.not_default", "not added to default PREFETCH_BY_ROLE");
assert(/PEOPLE_OPS_HR_MODULE_ENABLED = false/.test(hr), "hr.gate", "People Ops HR module remains off");
assert(!/Mark as Read/.test(page), "ui.no_consumer", "publisher page has no Mark as Read");
assert(/Confirm publish/.test(page), "ui.publish_confirm", "publish confirmation");
assert(/Confirm archive/.test(page), "ui.archive_confirm", "archive confirmation");
assert(/Back to Agent Resources/.test(page), "ui.back_label", "nested views return to Agent Resources list");
assert(/history\.pushState/.test(page), "ui.nested_history", "Manage/create push a history entry so browser Back stays on Agent Resources");
assert(/addEventListener\(["']popstate["']/.test(page), "ui.popstate", "publisher listens for browser Back on nested views");
assert(!/setActivePage\(["']labs["']\)/.test(page) && !/navigateToPage\(["']labs["']\)/.test(page), "ui.no_labs_hardcode", "does not hardcode Labs as the Manage back target");
assert(!/window\.open\(.*storage_path/.test(page), "ui.no_raw_path", "does not open raw storage path");

assert(!/agentResourceSupabaseApi/.test(visits), "regression.visits", "visits page not wired to publisher API");
assert(!/agentResourceSupabaseApi/.test(collections), "regression.collections", "collections page not wired to publisher API");
assert(!/agentResourceSupabaseApi/.test(orders), "regression.orders", "orders page not wired to publisher API");

if (!process.argv.includes("--remote")) {
  skip("live.publisher", "pass --remote after QA publisher cert; static publisher contract verified above");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Resources publisher contract (static)\n");

if (process.argv.includes("--remote")) {
  const { runLivePublisher, finishLive } = await import("./lib/agentResourcesLiveQa.mjs");
  const live = await runLivePublisher();
  finishLive("Agent Resources publisher", live);
  if (live.failures || live.criticalSkips) process.exit(process.exitCode || 1);
}
