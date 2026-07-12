#!/usr/bin/env node
/**
 * Sprint 1C — Employee Directory interaction feedback verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const tabSrc = readFileSync(resolve(root, "src/components/compensation/EmployeeDirectoryTab.jsx"), "utf8");
const drawerSrc = readFileSync(resolve(root, "src/components/peopleOps/EmployeeCompensation360Drawer.jsx"), "utf8");
const mapperSrc = readFileSync(resolve(root, "src/peopleOps/mapEmployeeDirectoryActionError.js"), "utf8");
const shellSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsTableShell.jsx"), "utf8");

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

assert(/mapEmployeeDirectoryActionError/.test(pageSrc), "page.directory_mapper", "page uses directory error mapper");
assert(/refreshEmployeeDirectory/.test(pageSrc), "page.refresh_directory", "directory refresh handler present");
assert(/directoryFocusProfileId/.test(pageSrc), "page.focus_return", "quick view focus return wired");
assert(/onExportSuccess/.test(pageSrc), "page.export_toast", "export success toast wired");
assert(/onRetry/.test(drawerSrc), "drawer.retry", "quick view drawer supports retry");

assert(/ActionErrorSummary/.test(tabSrc), "tab.error_summary", "directory shows inline action errors");
assert(/SEARCH_DEBOUNCE_MS/.test(tabSrc), "tab.debounce", "debounced search present");
assert(/data-employee-row/.test(tabSrc), "tab.row_data_attr", "rows expose focus target attribute");
assert(/bg-\[var\(--pc-brand-primary\)\]\/10/.test(tabSrc), "tab.selected_row", "selected row styling strengthened");
assert(/Exporting…/.test(tabSrc), "tab.export_loading", "export progress label present");
assert(/bulkBusy/.test(tabSrc), "tab.bulk_busy", "bulk action busy state present");
assert(/onRefresh/.test(tabSrc), "tab.refresh", "directory refresh prop supported");
assert(/scrollContainerRef/.test(tabSrc), "tab.scroll_preserve", "scroll container ref for refresh preserve");
assert(/No employees match/.test(tabSrc), "tab.empty_search", "search-specific empty state copy");

assert(/\.\.\.props/.test(shellSrc), "shell.row_props", "table row forwards data attributes");

assert(/DIRECTORY_LOAD_FAILED|EXPORT_FAILED/.test(mapperSrc), "map.errors", "directory errors mapped");

assert(/onBulkAssignPlan/.test(tabSrc), "tab.bulk_assign", "bulk assign retained");
assert(/onQuickViewEmployee/.test(tabSrc), "tab.quick_view", "quick view action retained");
assert(/onOpenEmployee/.test(tabSrc), "tab.workspace", "open workspace retained");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures})`);
  process.exit(1);
}
console.log("\nOverall: GO — employee directory interaction feedback verified\n");
