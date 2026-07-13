#!/usr/bin/env node
/**
 * Phase 4A compensation role UI verification.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const roleMatrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
const menuConfig = readFileSync(resolve(root, "src/config/menuConfig.js"), "utf8");
const portal = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const enterpriseCopy = readFileSync(resolve(root, "src/config/enterpriseCopy.js"), "utf8");
const pageRouting = readFileSync(resolve(root, "src/config/pageRouting.js"), "utf8");

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

assert(
  /compensationPayroll:\s*\[ROLES\.EXECUTIVE\]/.test(roleMatrix),
  "permission.executive_only",
  "Executive Compensation page is executive-only"
);
assert(
  !/compensationPayroll:\s*\[[^\]]*ROLES\.HR/.test(roleMatrix),
  "permission.no_hr",
  "HR cannot access Executive Compensation Center"
);
assert(
  !/compensationPayroll:\s*\[[^\]]*ROLES\.ADMIN/.test(roleMatrix),
  "permission.no_admin",
  "Admin cannot access Executive Compensation Center"
);
assert(/Executive Compensation/.test(enterpriseCopy), "copy.executive_label", "navigation label is Executive Compensation");
assert(/compensationPayroll/.test(menuConfig) && /EXECUTIVE_HQ_MENU_KEYS/.test(menuConfig), "menu.executive_visible", "executive menu includes compensation page");
const adminMenuBlock = /const ADMIN_HQ_MENU_KEYS = new Set\(\[([\s\S]*?)\]\);/.exec(menuConfig)?.[1] || "";
assert(!/"compensationPayroll"/.test(adminMenuBlock), "menu.admin_hidden", "admin menu excludes Executive Compensation");
assert(/ExecutiveCompensationCenterPage/.test(portal), "portal.page", "portal routes to Executive Compensation Center page");
assert(
  /case "executive-compensation"[\s\S]*return "compensationPayroll"/.test(pageRouting) ||
    /case "compensation-payroll"[\s\S]*return "compensationPayroll"/.test(pageRouting),
  "routing.alias",
  "compensation route aliases resolve"
);
assert(/HR workspace not enabled|executive-only/i.test(portal), "portal.hr_blocked", "HR portal shows no-access message");
assert(!/CompensationFoundationPlaceholder/.test(portal), "portal.no_placeholder", "foundation placeholder removed");

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
