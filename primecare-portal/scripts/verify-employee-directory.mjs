#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSrc = readFileSync(resolve(root, "src/pages/ExecutiveCompensationCenterPage.jsx"), "utf8");
const tabSrc = readFileSync(resolve(root, "src/components/compensation/EmployeeDirectoryTab.jsx"), "utf8");
const apiSrc = readFileSync(resolve(root, "src/api/compensationPlanAdminSupabaseApi.js"), "utf8");

let failures = 0;
function pass(id, detail) { console.log(`PASS  ${id}: ${detail}`); }
function fail(id, detail) { console.error(`FAIL  ${id}: ${detail}`); failures += 1; }
function assert(c, id, d) { c ? pass(id, d) : fail(id, d); }

assert(/Employees/.test(pageSrc), "page.employees_tab", "Employees tab present");
assert(/EmployeeDirectoryTab/.test(pageSrc), "page.directory_tab", "Employee directory wired");
assert(/Employee Compensation 360/.test(readFileSync(resolve(root, "src/components/compensation/EmployeeCompensation360Panel.jsx"), "utf8")), "ui.employee_360", "Employee 360 panel");
assert(/loadCompensationEmployeeDirectoryRead/.test(apiSrc), "api.directory", "employee directory API");
assert(/roleFilter/.test(tabSrc), "ui.role_filter", "role filter in directory");

if (failures) { console.error(`\nOverall: NO-GO (${failures})`); process.exit(1); }
console.log("\nOverall: GO\n");
