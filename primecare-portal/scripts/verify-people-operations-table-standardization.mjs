#!/usr/bin/env node
/** Phase 8.2 — People Operations table standardization verification. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const directorySrc = readFileSync(resolve(root, "src/components/compensation/EmployeeDirectoryTab.jsx"), "utf8");
const plansSrc = readFileSync(resolve(root, "src/components/compensation/CompensationPlansTab.jsx"), "utf8");
const shellSrc = readFileSync(resolve(root, "src/components/peopleOps/PeopleOpsTableShell.jsx"), "utf8");
const badgeSrc = readFileSync(resolve(root, "src/components/ux/StatusBadge.jsx"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/PeopleOpsTableShell/.test(directorySrc), "table.directory_shell", "directory uses table shell");
assert(/PeopleOpsTableShell/.test(plansSrc), "table.plans_shell", "plans use table shell");
assert(/sticky top-0/.test(shellSrc), "table.sticky_header", "table shell has sticky header");
assert(/label/.test(badgeSrc), "table.status_badge_label", "StatusBadge supports label prop");
assert(!/text-\[11px\].*bg-white/.test(directorySrc), "table.no_legacy_directory", "directory avoids legacy inline table styles");
assert(!/text-\[11px\].*bg-white/.test(plansSrc), "table.no_legacy_plans", "plans avoid legacy inline table styles");

if (failures) { console.error(`\nOverall: NO-GO (${failures} failure(s))`); process.exit(1); }
console.log("\nOverall: GO\n");
