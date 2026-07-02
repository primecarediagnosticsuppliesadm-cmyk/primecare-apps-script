#!/usr/bin/env node
/**
 * Blueprint Validator — drift detection for tables, RPCs, flags, routes, permissions, verify scripts, migrations.
 * Generates Blueprint Drift Report entries.
 */
import {
  PORTAL_ROOT,
  REPO_ROOT,
  getChangedFiles,
  isIncrementalMode,
  parseBlueprintTables,
  parseGapBpItems,
  parseRegistryEntries,
  parseSupabaseRpcs,
  parseVerifyScriptsFromMatrix,
  readText,
  rel,
  walkFiles,
} from "../lib/fs-utils.mjs";
import { ValidationReport, shouldEnforceFinding } from "../lib/report.mjs";

export async function runBlueprintValidator(options = {}) {
  const report = new ValidationReport("Blueprint");
  const drift = [];
  const incremental = options.incremental ?? isIncrementalMode();
  const scopeFiles = options.scopeFiles ?? (incremental ? getChangedFiles({ staged: options.staged }) : []);

  if (incremental && !scopeFiles.length) {
    report.info("BP-SKIP", "No changed files in scope — blueprint drift scan skipped");
    return report;
  }

  const blueprintSchema = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/01_Database_Schema.md`);
  const verifyMatrix = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/13_Verification_Matrix.md`);
  const changelog = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/CHANGELOG.md`);
  const screenCatalog = readText(`${PORTAL_ROOT}/docs/Certification_Framework/02_Screen_Ownership_Catalog.md`);
  const registryText = readText(`${REPO_ROOT}/docs/Architecture/Projection_Registry.md`);

  const blueprintTables = parseBlueprintTables(blueprintSchema);
  const matrixScripts = parseVerifyScriptsFromMatrix(verifyMatrix);
  const openGaps = parseGapBpItems(changelog).filter((g) => g.status === "OPEN");

  // --- Undocumented tables (migrations + sql/) — full scan only ---
  if (!incremental) {
  const sqlSources = [
    ...walkFiles(`${PORTAL_ROOT}/supabase/migrations`, { extensions: [".sql"] }),
    ...walkFiles(`${PORTAL_ROOT}/supabase/sql`, { extensions: [".sql"] }),
  ];
  const codeTables = new Set();
  for (const file of sqlSources) {
    const text = readText(file);
    for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      codeTables.add(m[1].toLowerCase());
    }
  }
  for (const table of codeTables) {
    if (!blueprintTables.has(table)) {
      drift.push({ type: "undocumented_table", item: table });
      const msg = `Undocumented table: ${table}`;
      if (!incremental) report.warn("BP-UNDOC-TABLE", msg);
    }
  }

  // --- Undocumented RPCs ---
  const blueprintRpcMentions = new Set();
  for (const m of `${blueprintSchema}\n${registryText}\n${verifyMatrix}`.matchAll(/([a-z_][a-z0-9_]*)\s*\(/g)) {
    blueprintRpcMentions.add(m[1].toLowerCase());
  }
  const codeRpcs = new Set();
  for (const file of sqlSources) {
    for (const rpc of parseSupabaseRpcs(readText(file))) codeRpcs.add(rpc);
  }
  for (const rpc of codeRpcs) {
    if (rpc.startsWith("_") || rpc.startsWith("pg_")) continue;
    const documented =
      blueprintRpcMentions.has(rpc) ||
      verifyMatrix.toLowerCase().includes(rpc) ||
      registryText.toLowerCase().includes(rpc);
    if (!documented && !rpc.startsWith("refresh_proj_") && !rpc.startsWith("read_")) {
      drift.push({ type: "undocumented_rpc", item: rpc });
      if (!incremental) report.warn("BP-UNDOC-RPC", `Undocumented RPC: ${rpc}()`);
    }
  }
  }

  // --- Feature flags (always quick) ---
  const flagsFile = readText(`${PORTAL_ROOT}/src/config/readProjectionFlags.js`);
  const flagNames = [...flagsFile.matchAll(/VITE_[A-Z0-9_]+/g)].map((m) => m[0]);
  const blueprintMentionsFlags = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/18_Domain_Projection_Architecture.md`);
  for (const flag of flagNames) {
    if (!blueprintMentionsFlags.includes(flag) && !registryText.includes(flag)) {
      drift.push({ type: "undocumented_flag", item: flag });
      report.warn("BP-UNDOC-FLAG", `Feature flag ${flag} not documented in Blueprint 18 or Registry`);
    }
  }

  // --- Routes ---
  const routingFile = readText(`${PORTAL_ROOT}/src/config/pageRouting.js`);
  const permFile = readText(`${PORTAL_ROOT}/src/config/rolePermissionMatrix.js`);
  const routeKeys = [...routingFile.matchAll(/PERMISSIONS\[["']([a-zA-Z0-9]+)["']\]/g)].map((m) => m[1]);
  const permKeys = [...permFile.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*):\s*\{/gm)].map((m) => m[1]);

  for (const key of permKeys) {
    if (!screenCatalog.includes(key) && !["predatorDebug", "qaCommandCenter"].includes(key)) {
      drift.push({ type: "undocumented_screen", item: key });
      if (!incremental) report.info("BP-UNDOC-SCREEN", `Page key "${key}" missing from Screen Ownership Catalog`);
    }
  }

  for (const key of routeKeys) {
    if (!permKeys.includes(key)) {
      report.warn("BP-ROUTE-PERM-DRIFT", `Route references permission key "${key}" not in rolePermissionMatrix`);
    }
  }

  // --- Verify scripts ---
  const scriptDir = `${PORTAL_ROOT}/scripts`;
  const diskScripts = walkFiles(scriptDir, { extensions: [".mjs"] })
    .map((f) => f.split("/").pop())
    .filter((n) => n.startsWith("verify-") || n.startsWith("run-") || n.startsWith("measure-"));

  for (const script of diskScripts) {
    if (!matrixScripts.has(script)) {
      drift.push({ type: "undocumented_verify_script", item: script });
      const isProjectionScript = script.startsWith("verify-projection");
      const inScope = scopeFiles.some((f) => f.includes(script));
      if (isProjectionScript && !inScope) {
        report.info("BP-UNDOC-VERIFY", `${script} not in Matrix 13 — add when stabilizing projection cert`);
      } else if (shouldEnforceFinding(script, scopeFiles, "error", incremental) && script.startsWith("verify-projection")) {
        report.error("BP-UNDOC-VERIFY", `Verify script ${script} not listed in Verification Matrix 13`);
      } else if (!incremental) {
        report.info("BP-UNDOC-VERIFY", `Verify script ${script} not listed in Verification Matrix 13`);
      }
    }
  }

  for (const script of matrixScripts) {
    if (!diskScripts.includes(script)) {
      report.error("BP-MISSING-VERIFY", `Verification Matrix lists ${script} but file missing`);
    }
  }

  // --- Migrations undocumented in CHANGELOG ---
  if (scopeFiles.length) {
    const migrationChanges = scopeFiles.filter((f) => f.includes("supabase/migrations/"));
    if (migrationChanges.length && !scopeFiles.some((f) => f.includes("CHANGELOG.md"))) {
      report.error("BP-MIGRATION-NO-CHANGELOG", "Migration changed without Blueprint CHANGELOG update", {
        file: migrationChanges[0],
      });
    }
    if (migrationChanges.length && !scopeFiles.some((f) => f.includes("01_Database_Schema.md"))) {
      report.warn("BP-MIGRATION-NO-SCHEMA-DOC", "Migration changed without 01_Database_Schema.md update", {
        file: migrationChanges[0],
      });
    }
  }

  // --- Open GAP-BP items ---
  for (const gap of openGaps) {
    report.info("BP-OPEN-GAP", `${gap.id} is OPEN — track in health dashboard`);
  }

  report.info("BP-DRIFT-COUNT", `Blueprint drift items: ${drift.length}`);
  report._drift = drift;

  if (!report.failed()) report.pass("BP-OK", "Blueprint validator completed");
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runBlueprintValidator();
  report.print();
  if (report._drift?.length) {
    console.log("\n--- Blueprint Drift Report ---");
    for (const d of report._drift.slice(0, 50)) {
      console.log(`  [${d.type}] ${d.item}`);
    }
    if (report._drift.length > 50) console.log(`  ... and ${report._drift.length - 50} more`);
  }
  process.exit(report.failed() ? 1 : 0);
}
