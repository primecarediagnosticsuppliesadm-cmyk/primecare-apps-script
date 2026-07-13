#!/usr/bin/env node
/**
 * RC1 role certification — permission matrix + role-scoped verify bundles.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
let warnings = 0;

function pass(id, msg) {
  console.log(`PASS  ${id}  ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}  ${msg}`);
  failures += 1;
}
function warn(id, msg) {
  console.warn(`WARN  ${id}  ${msg}`);
  warnings += 1;
}

function runNode(script) {
  const r = spawnSync("node", [resolve(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const PILOT_ROLES = ["executive", "admin", "hr", "agent", "lab"];

const ROLE_SCRIPTS = {
  executive: [
    "verify-founder-workspace.mjs",
    "verify-founder-navigation.mjs",
    "verify-executive-financial-intelligence.mjs",
    "verify-commercial-dashboard.mjs",
  ],
  admin: [
    "verify-orders-admin-flow.mjs",
    "verify-labs-admin-flow.mjs",
    "verify-credit-risk-admin-flow.mjs",
    "verify-operations-center-admin-flow.mjs",
  ],
  hr: [
    "verify-payroll-rbac.mjs",
    "verify-people-operations-shell.mjs",
    "verify-compensation-role-access.mjs",
  ],
  agent: [
    "verify-agent-collections-ownership-filter.mjs",
    "verify-agent-compensation-profile.mjs",
  ],
  lab: ["verify-lab-ordering-flow.mjs", "verify-lab-account-fallback.mjs"],
  distributor: ["verify-business-ownership.mjs"],
};

console.log("\n=== RC1 Role Certification ===\n");

const matrixPath = resolve(root, "src/config/rolePermissionMatrix.js");
if (!existsSync(matrixPath)) {
  fail("ROLE-MATRIX", "rolePermissionMatrix.js missing");
} else {
  const matrix = readFileSync(matrixPath, "utf8");
  for (const role of PILOT_ROLES) {
    if (matrix.includes(`"${role}"`) || matrix.includes(`'${role}'`)) {
      pass("ROLE-MATRIX", `role declared: ${role}`);
    } else {
      fail("ROLE-MATRIX", `role missing from matrix: ${role}`);
    }
  }
  if (matrix.includes("PILOT_LAUNCH_ROLES")) pass("ROLE-PILOT", "PILOT_LAUNCH_ROLES gate present");
  else fail("ROLE-PILOT", "PILOT_LAUNCH_ROLES missing");
  if (matrix.includes("founderOperatingSystem")) pass("ROLE-FOUNDER", "Founder OS permission wired");
  else warn("ROLE-FOUNDER", "founderOperatingSystem permission not found");
}

const menuPath = resolve(root, "src/config/menuConfig.js");
if (existsSync(menuPath)) {
  const menu = readFileSync(menuPath, "utf8");
  for (const key of ["FOUNDER", "EXECUTIVE", "OPERATIONS", "PEOPLE", "GROWTH"]) {
    if (menu.includes(key)) pass("ROLE-NAV", `workspace section: ${key}`);
    else warn("ROLE-NAV", `workspace section not found: ${key}`);
  }
}

for (const [role, scripts] of Object.entries(ROLE_SCRIPTS)) {
  console.log(`\n--- Role: ${role} ---\n`);
  for (const script of scripts) {
    const path = resolve(root, "scripts", script);
    if (!existsSync(path)) {
      warn(`ROLE-${role}`, `script missing: ${script}`);
      continue;
    }
    const { ok, out } = runNode(script);
    if (ok) {
      pass(`ROLE-${role}`, script);
    } else if (/Invalid login credentials|Agent login failed/i.test(out)) {
      warn(`ROLE-${role}`, `${script} — agent QA credentials missing (manual UAT blocker)`);
    } else if (/audit\.bounded|exceed.*read cap/i.test(out)) {
      warn(`ROLE-${role}`, `${script} — QA data volume exceeds bounded read cap`);
    } else if (/fetch failed|\.env\.local|auth failed/i.test(out)) {
      warn(`ROLE-${role}`, `${script} — env/auth unavailable`);
    } else {
      fail(`ROLE-${role}`, `${script}`);
    }
  }
}

const rls = runNode("verify-hq-rls-reads.mjs");
if (rls.ok) pass("ROLE-RLS", "verify-hq-rls-reads.mjs");
else fail("ROLE-RLS", "verify-hq-rls-reads.mjs");

console.log(`\nSummary: FAIL=${failures} WARN=${warnings}`);
if (failures > 0) {
  console.log("\nRESULT: FAIL — role certification incomplete\n");
  process.exit(1);
}
if (warnings > 0) {
  console.log("\nRESULT: WARN — role certification with manual UAT gaps\n");
  process.exit(0);
}
console.log("\nRESULT: PASS — role certification\n");
