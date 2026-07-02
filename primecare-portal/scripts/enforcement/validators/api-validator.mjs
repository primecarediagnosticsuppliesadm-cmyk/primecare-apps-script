#!/usr/bin/env node
/**
 * API Validator — read/write APIs, bounded reads, projection usage, deprecation, versioning.
 */
import {
  PORTAL_ROOT,
  REPO_ROOT,
  getChangedFiles,
  isIncrementalMode,
  readJson,
  readText,
  rel,
  walkFiles,
} from "../lib/fs-utils.mjs";
import { ValidationReport, shouldEnforceFinding } from "../lib/report.mjs";

const BOUNDED_HELPERS = [
  "hqReadBounds",
  "fetchOrdersBounded",
  "fetchPurchaseOrdersBoundedBundle",
  "fetchPaymentsForLabBoundedRows",
  "fetchAdminDashboardBoundedSourceRows",
  "HQ_",
  "_COLUMNS",
  ".limit(",
  "readOrdersListV1",
  "readLabReceivablesListV1",
];

export async function runApiValidator(options = {}) {
  const report = new ValidationReport("API");
  const incremental = options.incremental ?? isIncrementalMode();
  const scopeFiles = options.scopeFiles ?? (incremental ? getChangedFiles({ staged: options.staged }) : []);

  if (incremental && !scopeFiles.length) {
    report.info("API-SKIP", "No changed files in scope — API checks skipped");
    return report;
  }

  const domainApiMap = readJson("Domain_API_Map.json");
  const allKnown = new Set();
  for (const d of Object.values(domainApiMap.domains || {})) {
    for (const fn of [...(d.read || []), ...(d.write || [])]) allKnown.add(fn);
  }

  const apiDir = `${PORTAL_ROOT}/src/api`;
  const apiFiles = walkFiles(apiDir, { extensions: [".js"] });
  const pageFiles = walkFiles(`${PORTAL_ROOT}/src/pages`, { extensions: [".jsx", ".js"] });

  // --- Read/Write naming and domain ---
  for (const file of apiFiles) {
    const text = readText(file);
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;

    for (const m of text.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g)) {
      const fn = m[1];
      const isRead = fn.endsWith("Read") || fn.startsWith("read") && fn.endsWith("V1");
      const isWrite = fn.endsWith("Write");

      if (isRead || isWrite) {
        if (!allKnown.has(fn) && !fn.includes("Test")) {
          report.warn("API-UNDOC-READ", `API ${fn} not mapped in Domain_API_Map.json`, { file: fileRel });
        }
      }

      // Adapter naming: read_*_vN should not be named get*Summary
      if (/^get.*Summary/.test(fn)) {
        report.error("API-ADAPTER-NAMING", `${fn} uses screen-oriented naming — use read_*_vN adapter pattern`, { file: fileRel });
      }
    }

    // Unbounded select in Read functions
    const readBlocks = text.split(/export\s+async\s+function\s+[A-Za-z0-9_]*Read/);
    for (let i = 1; i < readBlocks.length; i++) {
      const block = readBlocks[i].slice(0, 2500);
      if (block.includes('.select("*")') || block.includes(".select('*')")) {
        const bounded = BOUNDED_HELPERS.some((h) => block.includes(h));
        if (!bounded) {
          report.error("API-UNBOUNDED-SELECT", "Read function uses select(*) without bounded helper", { file: fileRel });
        }
      }
    }
  }

  // --- Deprecated primecareApi in pages ---
  for (const file of pageFiles) {
    const text = readText(file);
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;
    if (text.includes('from "../api/primecareApi') || text.includes("from '@/api/primecareApi")) {
      report.error("API-DEPRECATED-BRIDGE", "Page imports legacy primecareApi.js — use Supabase module APIs", { file: fileRel });
    }
  }

  // --- Projection adapter usage in primecareSupabaseApi ---
  const mainApi = readText(`${apiDir}/primecareSupabaseApi.js`);
  if (mainApi.includes("readOrdersListV1") && mainApi.includes("isReadAdapterOrdersV1Enabled")) {
    report.pass("API-PROJ-ORDERS", "Orders read adapter wired with feature flag");
  }
  if (mainApi.includes("readLabReceivablesListV1") && mainApi.includes("isReadAdapterReceivablesV1Enabled")) {
    report.pass("API-PROJ-RECV", "Receivables read adapter wired with feature flag");
  }

  // --- RPC versioning in SQL ---
  const sqlFiles = walkFiles(`${PORTAL_ROOT}/supabase/migrations`, { extensions: [".sql"] });
  for (const file of sqlFiles) {
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;
    const text = readText(file);
    for (const m of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(read_[a-z_0-9]+)/gi)) {
      const rpc = m[1];
      if (!/_v\d+$/.test(rpc)) {
        report.warn("API-RPC-VERSION", `Read adapter RPC ${rpc} missing _vN version suffix`, { file: fileRel });
      }
    }
  }

  // --- Write APIs must not read projections for mutation decisions ---
  for (const file of apiFiles) {
    const text = readText(file);
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;
    const writeSections = text.match(/export\s+async\s+function\s+[A-Za-z0-9_]*Write[\s\S]*?(?=export\s+async\s+function|$)/g) || [];
    for (const block of writeSections) {
      if (block.includes('.from("proj_') || block.includes(".from('proj_")) {
        report.error("API-WRITE-PROJ-READ", "Write API reads projection table — writes must use SoT only", { file: fileRel });
      }
    }
  }

  if (!report.failed()) report.pass("API-OK", "API validator completed");
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runApiValidator();
  report.print();
  process.exit(report.failed() ? 1 : 0);
}
