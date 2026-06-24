#!/usr/bin/env node
/**
 * Negative test: HQ Admin cannot assign Executive via provisioning matrix.
 * Pure logic — no DB writes.
 */
import {
  ROLES,
  validateActorRoleAssignment,
  canActorProvisionRole,
} from "../src/config/rolePermissionMatrix.js";

let failed = 0;

function assert(condition, label) {
  if (!condition) {
    console.error("FAIL:", label);
    failed += 1;
  } else {
    console.log("PASS:", label);
  }
}

const adminToExec = validateActorRoleAssignment(ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT);
assert(adminToExec.ok === false, "Admin cannot assign Executive role");
assert(
  /cannot be assigned/i.test(adminToExec.error || ""),
  "Admin→Executive returns audit-safe error message"
);

assert(
  canActorProvisionRole(ROLES.ADMIN, ROLES.EXECUTIVE) === false,
  "canActorProvisionRole blocks Admin→Executive"
);
assert(
  canActorProvisionRole(ROLES.EXECUTIVE, ROLES.EXECUTIVE) === true,
  "Executive can assign Executive"
);
assert(
  validateActorRoleAssignment(ROLES.EXECUTIVE, ROLES.ADMIN, ROLES.AGENT).ok === true,
  "Executive can assign Admin"
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll role escalation guard assertions passed.");
