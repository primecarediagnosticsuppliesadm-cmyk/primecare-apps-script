#!/usr/bin/env node
/**
 * Compensation role-access foundation verification.
 * Static/read-only: validates HR role metadata, provisioning boundaries, and placeholder navigation.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const roleMatrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
const menuConfig = readFileSync(resolve(root, "src/config/menuConfig.js"), "utf8");
const pageRouting = readFileSync(resolve(root, "src/config/pageRouting.js"), "utf8");
const portal = readFileSync(resolve(root, "src/PrimeCareWebPortal.jsx"), "utf8");
const enterpriseCopy = readFileSync(resolve(root, "src/config/enterpriseCopy.js"), "utf8");
const pages = readdirSync(resolve(root, "src/pages"));

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
assert(/LOGIN_ENABLED_ROLES[\s\S]*ROLES\.HR/.test(roleMatrix), "role.hr_login", "HR login-enabled metadata present");
assert(/PILOT_LAUNCH_ROLES[\s\S]*ROLES\.HR/.test(roleMatrix), "role.hr_pilot", "HR pilot role gate present");
assert(
  /compensationPayroll:\s*\[ROLES\.EXECUTIVE,\s*ROLES\.HR,\s*ROLES\.ADMIN\]/.test(roleMatrix),
  "permission.compensation_payroll",
  "compensation placeholder permission includes Executive, HR, Admin"
);
assert(
  /\[ROLES\.ADMIN\]:\s*\{[\s\S]*cannotProvision:\s*\[ROLES\.EXECUTIVE,\s*ROLES\.HR\]/.test(roleMatrix),
  "provision.admin_block_hr",
  "Admin cannot provision HR"
);
assert(
  /\[ROLES\.EXECUTIVE\]:\s*\{[\s\S]*canProvision:\s*\[\.\.\.ALL_ROLE_SLUGS\]/.test(roleMatrix),
  "provision.executive_hr",
  "Executive provisioning includes all roles including HR"
);
assert(/"payroll support": ROLES\.HR/.test(roleMatrix), "role.alias", "HR aliases declared");

assert(/compensationPayroll/.test(enterpriseCopy), "copy.compensation", "enterprise label declared");
assert(
  /key:\s*"compensationPayroll"[\s\S]*label:\s*ENTERPRISE_PAGE_LABELS\.compensationPayroll/.test(menuConfig),
  "menu.placeholder",
  "navigation placeholder metadata present"
);
assert(
  /PILOT_SAFE_PAGE_KEYS[\s\S]*"compensationPayroll"/.test(menuConfig),
  "menu.pilot_safe",
  "placeholder page is pilot-safe"
);
assert(
  /case "compensation-payroll"[\s\S]*return "compensationPayroll"/.test(pageRouting),
  "routing.alias",
  "compensation payroll route alias present"
);
assert(
  /function CompensationFoundationPlaceholder/.test(portal) &&
    /role === ROLES\.HR/.test(portal) &&
    /Payroll calculations, preview, approval, locking, export, dashboards, and pages are not implemented/i.test(portal),
  "portal.placeholder_only",
  "portal renders foundation placeholder only"
);
assert(
  pages.every((file) => !/(Compensation|Payroll).*Page\.(jsx?|tsx?)$/.test(file)),
  "pages.no_payroll_page",
  "no compensation/payroll page file created"
);
assert(
  !/admin can provision HR/i.test(roleMatrix + menuConfig + portal),
  "provision.no_admin_copy",
  "no UI copy grants Admin HR provisioning"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}

console.log("\nOverall: GO\n");
