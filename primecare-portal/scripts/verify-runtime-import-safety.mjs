#!/usr/bin/env node
/**
 * Phase 0 — Runtime import safety gate (fails build on ReferenceError risk).
 *
 * Usage: node scripts/verify-runtime-import-safety.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** @type {{ symbol: string, importRe: RegExp, usageRe: RegExp }[]} */
const SYMBOL_CHECKS = [
  {
    symbol: "consumeHqNavContext",
    importRe:
      /import\s*\{[^}]*\bconsumeHqNavContext\b[^}]*\}\s*from\s*["']@\/operations\/hqGlobalSearchEngine(?:\.js)?["']/,
    usageRe: /\bconsumeHqNavContext\s*\(/,
  },
  {
    symbol: "cn",
    importRe: /import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*["']@\/lib\/utils["']/,
    usageRe: /\bcn\s*\(/,
  },
  {
    symbol: "extractReadHealth",
    importRe:
      /import\s*\{[^}]*\bextractReadHealth\b[^}]*\}\s*from\s*["']@\/observability\/readHealth(?:\.js)?["']/,
    usageRe: /\bextractReadHealth\s*\(/,
  },
  {
    symbol: "mergeReadHealth",
    importRe:
      /import\s*\{[^}]*\bmergeReadHealth\b[^}]*\}\s*from\s*["']@\/observability\/readHealth(?:\.js)?["']/,
    usageRe: /\bmergeReadHealth\s*\(/,
  },
];

const SHELL_FORBIDDEN = [
  "loadOperationsCommandCenterData",
  "loadExecutiveActionQueueEnrichment",
  "getFounderSnapshotRead",
  "get_founder_snapshot",
];

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}

function collectSourceFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (/\.(jsx?|tsx?)$/.test(name)) acc.push(full);
  }
  return acc;
}

function checkPageImports() {
  console.log("\n--- Import safety: pages + components ---\n");
  const scanRoots = [resolve(root, "src/pages"), resolve(root, "src/components")];
  let files = 0;
  for (const scanRoot of scanRoots) {
    for (const abs of collectSourceFiles(scanRoot)) {
      files += 1;
      const rel = relative(root, abs);
      const src = readFileSync(abs, "utf8");
      for (const { symbol, importRe, usageRe } of SYMBOL_CHECKS) {
        if (!usageRe.test(src)) continue;
        if (importRe.test(src)) pass(`${rel} — ${symbol} imported`);
        else fail(`${rel} — uses ${symbol} without import`);
      }
    }
  }
  console.log(`\nScanned ${files} JSX/JS files\n`);
}

function checkShellBlockers() {
  console.log("\n--- Shell blockers: sidebar summary ---\n");
  const sidebarSrc = readFileSync(resolve(root, "src/api/sidebarSummaryApi.js"), "utf8");
  for (const token of SHELL_FORBIDDEN) {
    if (sidebarSrc.includes(token)) fail(`sidebarSummaryApi references forbidden ${token}`);
    else pass(`sidebarSummaryApi does not reference ${token}`);
  }
  if (sidebarSrc.includes("getOrdersRead({ skipLineCounts: true })")) {
    pass("sidebarSummaryApi uses skipLineCounts orders read");
  } else {
    fail("sidebarSummaryApi missing skipLineCounts orders read");
  }

  const appSrc = readFileSync(resolve(root, "src/App.jsx"), "utf8");
  if (/requestIdleCallback|setTimeout\(startPolling/.test(appSrc)) {
    pass("App.jsx defers nav badge polling");
  } else {
    fail("App.jsx does not defer nav badge polling");
  }
}

function main() {
  console.log("\n=== Runtime import safety (Phase 0) ===\n");
  checkPageImports();
  checkShellBlockers();
  console.log("\nOptional: npx eslint -c eslint.runtime-safety.config.js src/pages src/components\n");
  console.log("\n=== Runtime import safety complete ===\n");
  if (process.exitCode) {
    console.log("Overall: NO-GO (ReferenceError risk or shell blocker)\n");
  } else {
    console.log("Overall: GO\n");
  }
}

main();
