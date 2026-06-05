import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname;
const EXEMPT = new Set(["TenantViewContext.jsx"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(path);
  }
  return out;
}

let failed = false;
for (const file of walk(SRC)) {
  const base = file.split("/").pop();
  if (EXEMPT.has(base)) continue;
  const src = readFileSync(file, "utf8");
  if (!src.includes("useTenantView(")) continue;
  if (!/import\s*\{[^}]*\buseTenantView\b[^}]*\}\s*from\s+["']@\/context\/TenantViewContext\.jsx["']/.test(src)) {
    console.error(`[check:tenant-view] Missing useTenantView import in ${file}`);
    failed = true;
  }
}

if (failed) process.exit(1);
