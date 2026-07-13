#!/usr/bin/env node
/**
 * Security Validator — tenant isolation, RLS, SECURITY DEFINER, role matrix drift.
 */
import {
  PORTAL_ROOT,
  REPO_ROOT,
  getChangedFiles,
  isIncrementalMode,
  readText,
  rel,
  walkFiles,
} from "../lib/fs-utils.mjs";
import { ValidationReport, shouldEnforceFinding } from "../lib/report.mjs";

export async function runSecurityValidator(options = {}) {
  const report = new ValidationReport("Security");
  const incremental = options.incremental ?? isIncrementalMode();
  const scopeFiles = options.scopeFiles ?? (incremental ? getChangedFiles({ staged: options.staged }) : []);

  const permMatrix = readText(`${PORTAL_ROOT}/src/config/rolePermissionMatrix.js`);
  const permissions = readText(`${PORTAL_ROOT}/src/config/permissions.js`);

  if (!permissions.includes("rolePermissionMatrix")) {
    report.error("SEC-PERM-DRIFT", "permissions.js must derive from rolePermissionMatrix (single SoT)");
  } else {
    report.pass("SEC-PERM-SOT", "Permission matrix single source of truth");
  }

  // --- New migrations: RLS ---
  const migrationFiles = walkFiles(`${PORTAL_ROOT}/supabase/migrations`, { extensions: [".sql"] });
  for (const file of migrationFiles) {
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;
    const text = readText(file);
    const createsTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_]+)/i.test(text);
    const enablesRls = /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(text);
    const createsPolicy = /CREATE\s+POLICY/i.test(text);

    if (createsTable && !text.includes("proj_") && !enablesRls) {
      report.error("SEC-MISSING-RLS", "New table migration without ENABLE ROW LEVEL SECURITY", { file: fileRel });
    }
    if (createsTable && enablesRls && !createsPolicy && !text.includes("proj_")) {
      report.warn("SEC-MISSING-POLICY", "RLS enabled but no CREATE POLICY in same migration", { file: fileRel });
    }

    // SECURITY DEFINER functions
    for (const m of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_0-9]+)[\s\S]*?SECURITY\s+DEFINER/gi)) {
      const fn = m[1];
      const fnBlock = m[0];
      if (!fnBlock.includes("tenant_id") && !fn.startsWith("_proj_")) {
        report.warn("SEC-DEFINER-TENANT", `SECURITY DEFINER ${fn} should validate tenant_id`, { file: fileRel });
      }
    }
  }

  // --- Client writes: tenant_id ---
  const apiFiles = walkFiles(`${PORTAL_ROOT}/src/api`, { extensions: [".js"] });
  for (const file of apiFiles) {
    const text = readText(file);
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;

    const writeFns = text.match(/export\s+async\s+function\s+[A-Za-z0-9_]*Write[\s\S]*?(?=export\s+async\s+function|$)/g) || [];
    for (const block of writeFns) {
      if (block.includes(".insert(") || block.includes(".update(")) {
        if (!block.includes("tenant_id") && !block.includes("tenantId")) {
          report.warn("SEC-TENANT-LEAK", "Write function may miss explicit tenant_id scoping", { file: fileRel });
        }
      }
    }
  }

  // --- Hardcoded role checks in pages (anti-pattern) ---
  const pageFiles = walkFiles(`${PORTAL_ROOT}/src/pages`, { extensions: [".jsx"] });
  for (const file of pageFiles) {
    const text = readText(file);
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;
    if (/role\s*===\s*["'](admin|executive|lab|agent)["']/.test(text) && !text.includes("canAccess") && !text.includes("rolePermissionMatrix")) {
      report.warn("SEC-HARDCODED-ROLE", "Hardcoded role check — use rolePermissionMatrix / canAccess", { file: fileRel });
    }
  }

  // --- event_log RLS gap (TD-012) ---
  const schema = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/01_Database_Schema.md`);
  if (schema.includes("event_log") && !schema.toLowerCase().includes("rls") && schema.includes("event_log")) {
    report.info("SEC-KNOWN-GAP", "TD-012: event_log RLS gap documented — track in debt register");
  }

  if (!report.failed()) report.pass("SEC-OK", "Security validator completed");
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runSecurityValidator();
  report.print();
  process.exit(report.failed() ? 1 : 0);
}
