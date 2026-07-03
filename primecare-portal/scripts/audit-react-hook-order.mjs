#!/usr/bin/env node
/**
 * Sprint 3B — detect hooks called after early return in default-export page components.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const HOOK_RE = /\b(useMemo|useEffect|useState|useCallback|useRef|useContext|useReducer|useId)\s*\(/;
const TOP_LEVEL_RETURN_RE = /^\s{2}(if\s*\([^)]*\)\s*)?return\s/m;

function collectFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      collectFiles(full, acc);
      continue;
    }
    if (/\.(jsx|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

function auditFile(abs) {
  const rel = relative(root, abs);
  const src = readFileSync(abs, "utf8");
  const issues = [];

  const defaultFns = [...src.matchAll(/export default function (\w+)/g)];
  for (const m of defaultFns) {
    const name = m[1];
    const start = m.index;
    const brace = src.indexOf("{", start);
    if (brace < 0) continue;

    let depth = 0;
    let end = -1;
    for (let i = brace; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;

    const body = src.slice(brace + 1, end);
    const lines = body.split("\n");
    let fnDepth = 0;
    let firstTopLevelReturn = -1;
    const hooksAfterReturn = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (/^(function|async function)\s/.test(trimmed)) {
        fnDepth++;
        continue;
      }
      if (fnDepth > 0) {
        fnDepth += (line.match(/\{/g) || []).length;
        fnDepth -= (line.match(/\}/g) || []).length;
        continue;
      }
      if (fnDepth === 0 && TOP_LEVEL_RETURN_RE.test(line)) {
        if (firstTopLevelReturn < 0) firstTopLevelReturn = i;
      }
      if (fnDepth === 0 && HOOK_RE.test(line) && firstTopLevelReturn >= 0 && i > firstTopLevelReturn) {
        hooksAfterReturn.push({ line: i + 1, text: trimmed.slice(0, 80) });
      }
    }

    if (hooksAfterReturn.length) {
      issues.push({ fn: name, hooksAfterReturn });
    }
  }

  return { rel, issues };
}

const scanRoots = [
  resolve(root, "src/pages"),
  resolve(root, "src/components"),
  resolve(root, "src/projectionOps"),
];

const rootOnlyFiles = ["App.jsx", "PrimeCareWebPortal.jsx"];

const allIssues = [];
let scanned = 0;
for (const scanRoot of scanRoots) {
  for (const abs of collectFiles(scanRoot)) {
    scanned++;
    const { rel, issues } = auditFile(abs);
    if (issues.length) allIssues.push({ rel, issues });
  }
}
for (const name of rootOnlyFiles) {
  const abs = resolve(root, "src", name);
  try {
    scanned++;
    const { rel, issues } = auditFile(abs);
    if (issues.length) allIssues.push({ rel, issues });
  } catch {
    // optional file
  }
}

console.log(`\n=== React hook order audit (${scanned} files) ===\n`);
if (!allIssues.length) {
  console.log("PASS  No hooks-after-early-return detected in default exports\n");
  process.exit(0);
}

for (const { rel, issues } of allIssues) {
  console.log(`FAIL  ${rel}`);
  for (const issue of issues) {
    console.log(`      ${issue.fn}:`);
    for (const h of issue.hooksAfterReturn) {
      console.log(`        L${h.line}: ${h.text}`);
    }
  }
}
console.log(`\nOverall: NO-GO (${allIssues.length} file(s))\n`);
process.exit(1);
