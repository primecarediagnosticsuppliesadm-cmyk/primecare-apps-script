#!/usr/bin/env node
/** Sprint 1D — People Operations navigation & context verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const navJs = readFileSync(resolve(root, "src/peopleOps/peopleOpsNavigation.js"), "utf8");
const storageJs = readFileSync(resolve(root, "src/peopleOps/peopleOpsReportingContextStorage.js"), "utf8");
const breadcrumbSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsBreadcrumbs.jsx"), "utf8");
const frameSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsModuleFrame.jsx"), "utf8");
const contextStripSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsContextStrip.jsx"), "utf8");
const moduleNavSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOperationsModuleNav.jsx"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const emptyStateSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsPayrollEmptyState.jsx"), "utf8");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(c, id, d) {
  c ? pass(id, d) : fail(id, d);
}

assert(/route:\s*\{/.test(navJs), "nav.breadcrumb_routes", "breadcrumbs carry navigation routes");
assert(/breadcrumbRouteForItem/.test(navJs), "nav.breadcrumb_route_helper", "breadcrumb route resolver exported");
assert(/employees.*workspace/.test(navJs) && /Directory/.test(navJs), "nav.workspace_trail", "workspace breadcrumb includes Directory crumb");

assert(/readReportingSelection/.test(storageJs), "ctx.read_selection", "reporting selection read helper");
assert(/writeReportingSelection/.test(storageJs), "ctx.write_selection", "reporting selection write helper");
assert(/sessionStorage/.test(storageJs), "ctx.session_storage", "reporting context persisted in sessionStorage");

assert(/onNavigate/.test(breadcrumbSrc), "ui.clickable_breadcrumbs", "breadcrumbs support navigation callback");
assert(/aria-current="page"/.test(breadcrumbSrc), "a11y.current_crumb", "current breadcrumb marked");

assert(/onBreadcrumbNavigate/.test(frameSrc), "ui.frame_navigate", "module frame forwards breadcrumb navigation");

assert(/Viewing:/.test(contextStripSrc), "ui.context_strip", "context strip labels active view");

assert(/ring-2 ring-\[var\(--pc-brand-primary\)\]/.test(moduleNavSrc), "ui.active_module_ring", "stronger active module styling");

assert(/readReportingSelection/.test(pageSrc), "page.read_session", "page restores reporting context from session");
assert(/writeReportingSelection/.test(pageSrc), "page.write_session", "page persists reporting context to session");
assert(/moduleFrameContextProps/.test(pageSrc), "page.context_props", "shared module frame context props");
assert(/onBreadcrumbNavigate:\s*navigatePeopleOps/.test(pageSrc), "page.breadcrumb_handler", "breadcrumbs wired to navigatePeopleOps");
assert(/PeopleOpsContextStrip/.test(pageSrc), "page.context_strip", "page renders context strip");
assert(/buildPeopleOpsBreadcrumbs/.test(pageSrc), "page.breadcrumbs", "page builds enriched breadcrumbs");
assert(!/bg-indigo-50\/40/.test(pageSrc), "ui.period_row_highlight", "payroll period row uses brand highlight");

assert(/reportingPeriodLabel/.test(emptyStateSrc), "ui.empty_period_context", "payroll empty state accepts period label");

assert(!/supabase\/migrations/.test(pageSrc + navJs + storageJs), "guard.no_schema", "no schema changes");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
