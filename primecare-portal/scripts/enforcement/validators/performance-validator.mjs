#!/usr/bin/env node
/**
 * Performance Validator — N+1, unbounded queries, duplicate reads, bundle regression heuristics.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
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

const PERF_BUDGETS = readText(`${PORTAL_ROOT}/docs/Certification_Framework/07_Performance_Certification_Matrix.md`);

const NPLUS1_PATTERNS = [
  { pattern: /for\s*\([^)]*\)\s*\{[^}]*\.from\s*\(\s*["']order_lines["']\s*\)/s, code: "PERF-NPLUS1-ORDER-LINES" },
  { pattern: /for\s*\([^)]*\)\s*\{[^}]*\.from\s*\(\s*["']order_items["']\s*\)/s, code: "PERF-NPLUS1-ORDER-ITEMS" },
  { pattern: /for\s*\([^)]*\)\s*\{[^}]*getOrderDetailsRead/s, code: "PERF-NPLUS1-ORDER-DETAILS" },
  { pattern: /Promise\.all\([^)]*\.map\([^)]*getOrderDetailsRead/s, code: "PERF-BATCH-ORDER-DETAILS" },
];

export async function runPerformanceValidator(options = {}) {
  const report = new ValidationReport("Performance");
  const incremental = options.incremental ?? isIncrementalMode();
  const scopeFiles = options.scopeFiles ?? (incremental ? getChangedFiles({ staged: options.staged }) : []);

  const scanDirs = [`${PORTAL_ROOT}/src/api`, `${PORTAL_ROOT}/src/pages`, `${PORTAL_ROOT}/src/operations`, `${PORTAL_ROOT}/src/founder`];
  const files = scanDirs.flatMap((d) => walkFiles(d, { extensions: [".js", ".jsx"] }));

  for (const file of files) {
    const text = readText(file);
    const fileRel = rel(file);
    if (incremental && scopeFiles.length && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;

    for (const { pattern, code } of NPLUS1_PATTERNS) {
      if (pattern.test(text)) {
        const msg = `Potential N+1 / fan-out pattern detected (${code})`;
        if (shouldEnforceFinding(fileRel, scopeFiles, "error", incremental)) report.error(code, msg, { file: fileRel });
        else report.warn(code, msg, { file: fileRel });
      }
    }

    if (text.includes('.from("payments").select("*")') || text.includes(".from('payments').select('*')")) {
      if (!text.includes("fetchPaymentsForLabBoundedRows") && !text.includes(".limit(")) {
        report.error("PERF-UNBOUNDED-SELECT", "Unbounded payments select", { file: fileRel });
      }
    }

    if (text.includes('.from("purchase_orders").select("*")')) {
      if (!text.includes("fetchPurchaseOrdersBoundedBundle")) {
        report.error("PERF-UNBOUNDED-SELECT", "Unbounded purchase_orders select", { file: fileRel });
      }
    }

    // Duplicate coordinated reads in same file
    const fromCounts = new Map();
    for (const m of text.matchAll(/\.from\s*\(\s*["']([a-z_]+)["']\s*\)/g)) {
      const t = m[1];
      fromCounts.set(t, (fromCounts.get(t) || 0) + 1);
    }
    for (const [table, count] of fromCounts) {
      if (count >= 5 && ["orders", "order_lines", "payments", "invoices"].includes(table)) {
        report.warn("PERF-DUPLICATE-READS", `${count} reads of "${table}" in single file — consider projection or bundle`, { file: fileRel });
      }
    }
  }

  // Projection bypass on dashboard
  const dashboardLoader = readText(`${PORTAL_ROOT}/src/api/hqBoundedReads.js`);
  if (dashboardLoader.includes("fetchAdminDashboardBoundedSourceRows")) {
    const pages = walkFiles(`${PORTAL_ROOT}/src/pages`, { extensions: [".jsx"] });
    const dash = pages.find((p) => p.includes("AdminDashboard") || p.includes("adminDashboard"));
    if (dash) {
      const t = readText(dash);
      if (t.includes("fetchAdminDashboardBoundedSourceRows") && !t.includes("readTenantDashboardV1")) {
        report.warn("PERF-PROJECTION-BYPASS", "Admin Dashboard still uses transactional bounded bundle — TD-001 remainder");
      }
    }
  }

  // Bundle size regression (dist/assets after build)
  const distDir = `${PORTAL_ROOT}/dist/assets`;
  if (existsSync(distDir)) {
    const assets = walkFiles(distDir, { extensions: [".js"] });
    let total = 0;
    for (const f of assets) total += statSync(f).size;
    const mb = total / (1024 * 1024);
    if (mb > 3.5) report.warn("PERF-BUNDLE-SIZE", `JS bundle total ${mb.toFixed(2)} MB exceeds 3.5 MB advisory budget`);
    else report.pass("PERF-BUNDLE", `Bundle ${mb.toFixed(2)} MB within advisory budget`);
  } else {
    report.info("PERF-BUNDLE-SKIP", "Run npm run build for bundle size check");
  }

  // Budget documentation presence
  if (!PERF_BUDGETS.includes("350 ms")) {
    report.warn("PERF-MATRIX", "Performance Certification Matrix missing standard budgets");
  }

  if (!report.failed()) report.pass("PERF-OK", "Performance validator completed");
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runPerformanceValidator();
  report.print();
  process.exit(report.failed() ? 1 : 0);
}
