#!/usr/bin/env node
/** Phase 8.2 — People Operations navigation verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const navSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOperationsModuleNav.jsx"), "utf8");
const frameSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsModuleFrame.jsx"), "utf8");
const breadcrumbSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsBreadcrumbs.jsx"), "utf8");
const navJs = readFileSync(resolve(root, "src/peopleOps/peopleOpsNavigation.js"), "utf8");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const filterSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsFilterBar.jsx"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/buildPeopleOpsBreadcrumbs/.test(navJs), "nav.breadcrumb_helper", "breadcrumb builder exported");
assert(/PeopleOpsBreadcrumbs/.test(frameSrc), "nav.breadcrumb_component", "module frame supports breadcrumbs");
assert(/aria-label="Breadcrumb"/.test(breadcrumbSrc), "a11y.breadcrumb", "breadcrumb has aria label");
assert(/sticky top-0/.test(navSrc), "nav.sticky", "module navigation is sticky");
assert(/sticky top-0/.test(filterSrc), "nav.sticky_filters", "filter bar is sticky");
assert(/buildPeopleOpsBreadcrumbs/.test(pageSrc), "nav.page_breadcrumbs", "page builds breadcrumbs");
assert(/breadcrumbs=\{breadcrumbs\}/.test(pageSrc), "nav.breadcrumbs_wired", "breadcrumbs passed to modules");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
