#!/usr/bin/env node
/**
 * Compensation role-access verification.
 * Static/read-only: validates executive-only Phase 4A UI access boundaries.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const roleMatrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
const menuConfig = readFileSync(resolve(root, "src/config/menuConfig.js"), "utf8");
const pageRouting = readFileSync(resolve(root, "src/config/pageRouting.js"), "utf8");
const portal = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const enterpriseCopy = readFileSync(resolve(root, "src/config/enterpriseCopy.js"), "utf8");

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

assert(/HR:\s*"hr"/.test(roleMatrix), "role.hr_constant", "ROLES.HR declared");
assert(/HQ HR \/ Payroll Support/.test(roleMatrix), "role.hr_label", "HR label declared");
assert(
  /compensationPayroll:\s*\[ROLES\.EXECUTIVE\]/.test(roleMatrix),
  "permission.compensation_payroll",
  "Executive Compensation page is executive-only"
);
assert(/Executive Compensation/.test(enterpriseCopy), "copy.compensation", "Executive Compensation label declared");
assert(
  /key:\s*"compensationPayroll"[\s\S]*label:\s*ENTERPRISE_PAGE_LABELS\.compensationPayroll/.test(menuConfig),
  "menu.executive_compensation",
  "navigation metadata present"
);
assert(
  /case "compensation-payroll"[\s\S]*return "compensationPayroll"/.test(pageRouting),
  "routing.alias",
  "compensation payroll route alias present"
);
assert(/ExecutiveCompensationCenterPage/.test(portal), "portal.executive_page", "Executive Compensation Center page wired");
assert(!/CompensationFoundationPlaceholder/.test(portal), "portal.no_placeholder", "foundation placeholder removed");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}

console.log("\nOverall: GO\n");
