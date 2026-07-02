#!/usr/bin/env node
/**
 * Static gate — page/component symbols must be imported before use.
 * Catches runtime ReferenceErrors like missing consumeHqNavContext or cn.
 *
 * Usage: node scripts/verify-page-import-integrity.mjs
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

function checkFile(relPath, src) {
  let ok = true;
  for (const { symbol, importRe, usageRe } of SYMBOL_CHECKS) {
    if (!usageRe.test(src)) continue;
    if (importRe.test(src)) {
      pass(`${relPath} — ${symbol} imported`);
    } else {
      fail(`${relPath} — uses ${symbol} without import`);
      ok = false;
    }
  }
  return ok;
}

function main() {
  console.log("\n=== Page import integrity (shared helpers) ===\n");

  const scanRoots = [
    resolve(root, "src/pages"),
    resolve(root, "src/components"),
  ];

  let files = 0;
  for (const scanRoot of scanRoots) {
    for (const abs of collectSourceFiles(scanRoot)) {
      files += 1;
      const rel = relative(root, abs);
      const src = readFileSync(abs, "utf8");
      checkFile(rel, src);
    }
  }

  console.log(`\nScanned ${files} files under src/pages and src/components\n`);
  if (process.exitCode) {
    console.log("Overall: NO-GO\n");
  } else {
    console.log("Overall: GO\n");
  }
}

main();
