#!/usr/bin/env node
/**
 * RC-5 static scan for customer-facing dead-end copy in pages/components.
 * Excludes predator/, docs/, scripts/, internal validators.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

const FORBIDDEN = [
  /coming\s+soon/i,
  /available\s+soon/i,
  /placeholder is available/i,
  /not available yet/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /not implemented/i,
  /under construction/i,
];

const SKIP_DIRS = new Set(["predator", "readiness", "__tests__"]);
const SKIP_FILES = /(validator|Predator|migrationTrace|enterpriseCopy)/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, out);
      continue;
    }
    if (!/\.(jsx?|tsx?)$/.test(name)) continue;
    if (SKIP_FILES.test(name)) continue;
    if (full.includes("/pages/") || full.includes("/components/") || full.includes("/layout/")) {
      out.push(full);
    }
  }
  return out;
}

const hits = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    for (const re of FORBIDDEN) {
      if (re.test(line)) {
        hits.push({ file: relative(join(ROOT), file), line: i + 1, text: line.trim().slice(0, 120) });
        break;
      }
    }
  });
}

console.log("# HQ Zero Dead Ends — Static Copy Audit\n");
if (!hits.length) {
  console.log("## Result: PASS (0 forbidden customer-facing patterns)\n");
  process.exit(0);
}

console.log(`## Result: FAIL (${hits.length} hits)\n`);
for (const h of hits) {
  console.log(`- \`${h.file}:${h.line}\` — ${h.text}`);
}
process.exit(1);
