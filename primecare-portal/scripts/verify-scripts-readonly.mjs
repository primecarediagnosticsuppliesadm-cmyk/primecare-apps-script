#!/usr/bin/env node
/**
 * Verify that verification/certification scripts are read-only by default.
 *
 * Fails target scripts that contain obvious mutating Supabase/SQL patterns unless
 * the script is mutation-specific (repair-/backfill-) or explicitly gates those
 * paths behind --apply / CONFIRM_MUTATION=true.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptsDir = __dirname;
const self = basename(fileURLToPath(import.meta.url));

const TARGET_SCRIPT = /^(verify-|check-|measure-).+\.mjs$|^run-.+-certification\.mjs$/;
const MUTATION_ALLOWLIST = /^(repair-|backfill-).+\.mjs$/;
const APPLY_GUARD_PATTERNS = [
  'process.argv.includes("--apply")',
  "process.argv.includes('--apply')",
  "CONFIRM_MUTATION",
];

const MUTATING_PATTERNS = [
  { id: ".update(", regex: /\.update\s*\(/, requiresSupabaseFrom: true },
  { id: ".insert(", regex: /\.insert\s*\(/, requiresSupabaseFrom: true },
  { id: ".upsert(", regex: /\.upsert\s*\(/, requiresSupabaseFrom: true },
  { id: ".delete(", regex: /\.delete\s*\(/, requiresSupabaseFrom: true },
  { id: 'rpc("repair', regex: /rpc\s*\(\s*["'`]repair/i },
  { id: 'rpc("reconcile', regex: /rpc\s*\(\s*["'`]reconcile/i },
  { id: 'rpc("backfill', regex: /rpc\s*\(\s*["'`]backfill/i },
  { id: 'rpc("seed', regex: /rpc\s*\(\s*["'`]seed/i },
  { id: '"UPDATE "', regex: /["'`]UPDATE\s/i },
  { id: '"INSERT "', regex: /["'`]INSERT\s/i },
  { id: '"DELETE "', regex: /["'`]DELETE\s/i },
  { id: '"UPSERT "', regex: /["'`]UPSERT\s/i },
];

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}

function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}

function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
}

function lineForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

function hasSupabaseFromContext(lines, lineNumber) {
  const start = Math.max(0, lineNumber - 4);
  const end = Math.min(lines.length, lineNumber + 1);
  return lines.slice(start, end).some((line) => /\.from\s*\(/.test(line));
}

function hasApplyGuard(source) {
  return APPLY_GUARD_PATTERNS.some((needle) => source.includes(needle));
}

const files = readdirSync(scriptsDir)
  .filter((file) => file.endsWith(".mjs"))
  .filter((file) => file !== self)
  .filter((file) => TARGET_SCRIPT.test(file))
  .sort();

let guarded = 0;
let clean = 0;

for (const file of files) {
  const source = readFileSync(resolve(scriptsDir, file), "utf8");
  const lines = source.split("\n");
  const hits = [];
  for (const pattern of MUTATING_PATTERNS) {
    const match = pattern.regex.exec(source);
    if (match) {
      const line = lineForIndex(source, match.index);
      if (pattern.requiresSupabaseFrom && !hasSupabaseFromContext(lines, line)) {
        continue;
      }
      hits.push({
        id: pattern.id,
        line,
      });
    }
  }

  if (!hits.length) {
    clean += 1;
    pass(file, "no obvious mutating patterns");
    continue;
  }

  if (MUTATION_ALLOWLIST.test(file) || hasApplyGuard(source)) {
    guarded += 1;
    warn(
      file,
      `mutation-capable patterns gated by explicit apply guard: ${hits
        .map((hit) => `${hit.id}@${hit.line}`)
        .join(", ")}`
    );
    continue;
  }

  fail(
    file,
    `mutating patterns without --apply / CONFIRM_MUTATION guard: ${hits
      .map((hit) => `${hit.id}@${hit.line}`)
      .join(", ")}`
  );
}

console.log("\n=== Verification script read-only audit ===");
console.log(`Scripts audited: ${files.length}`);
console.log(`Clean scripts: ${clean}`);
console.log(`Mutation-capable but guarded: ${guarded}`);

if (process.exitCode) {
  console.log("\nOverall: NO-GO (unguarded mutating verification script found)\n");
} else {
  console.log("\nOverall: GO (verification scripts are read-only by default)\n");
}
