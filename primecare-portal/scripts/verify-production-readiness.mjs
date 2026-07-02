#!/usr/bin/env node
/**
 * Sprint 3A production readiness gate — P0 checklist from hardening audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const P0_DOCS = [
  "docs/operations/Sprint3A_Backup_Validation_Checklist.md",
  "docs/operations/Sprint3A_Restore_Verification_Checklist.md",
  "docs/operations/Sprint3A_Deployment_Rollback_Verification.md",
  "docs/operations/Sprint3A_Production_Runbook.md",
  "docs/operations/Sprint3A_Migration_Manifest.md",
  "docs/operations/Sprint3A_Migration_Remediation_Plan.md",
];

const P0_CODE = [
  "supabase/migrations/20260702170000_sprint3a_production_safety_hardening.sql",
  "supabase/functions/reset-platform-user-password/index.ts",
  "src/observability/monitoring.js",
  "src/components/ux/ReadHealthBanner.jsx",
];

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}

function runNode(script) {
  const r = spawnSync("node", [resolve(root, "scripts", script)], {
    encoding: "utf8",
    cwd: root,
  });
  return r.status === 0;
}

async function main() {
  console.log("\n=== Sprint 3A production readiness verification ===\n");

  for (const rel of [...P0_DOCS, ...P0_CODE]) {
    if (existsSync(resolve(root, rel))) {
      pass(`artifact — ${rel}`);
    } else {
      fail(`missing — ${rel}`);
    }
  }

  const api = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
  if (api.includes("readFailed: true") && api.includes("EMPTY_ADMIN_DASHBOARD")) {
    pass("REL-01 dashboard catch returns readFailed (not silent success)");
  } else {
    fail("REL-01 dashboard silent failure fix missing");
  }

  const flags = readFileSync(resolve(root, "src/config/readProjectionFlags.js"), "utf8");
  if (flags.includes("isProjectionShadowMode") && flags.includes('=== "true"')) {
    pass("read adapter flags opt-in only (shadow mode when unset)");
  } else {
    fail("readProjectionFlags.js shadow invariant missing");
  }

  if (runNode("verify-security-hardening.mjs")) {
    pass("verify-security-hardening.mjs");
  } else {
    fail("verify-security-hardening.mjs");
  }

  if (runNode("verify-observability.mjs")) {
    pass("verify-observability.mjs");
  } else {
    fail("verify-observability.mjs");
  }

  if (runNode("verify-migration-integrity.mjs")) {
    pass("verify-migration-integrity.mjs");
  } else {
    fail("verify-migration-integrity.mjs");
  }

  if (runNode("verify-admin-dashboard-no-transactional-lines.mjs")) {
    pass("verify-admin-dashboard-no-transactional-lines.mjs");
  } else {
    fail("verify-admin-dashboard-no-transactional-lines.mjs");
  }

  if (runNode("verify-runtime-import-safety.mjs")) {
    pass("verify-runtime-import-safety.mjs");
  } else {
    fail("verify-runtime-import-safety.mjs");
  }

  console.log("\n=== Production readiness verification complete ===\n");
  if (process.exitCode) {
    console.log("Overall: NO-GO (P0 gaps remain)\n");
  } else {
    console.log("Overall: CONDITIONAL GO (Sprint 3A P0 code/docs closed — prod env/UAT still required)\n");
  }
}

main();
