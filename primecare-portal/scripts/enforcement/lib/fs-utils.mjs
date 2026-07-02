import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../../../..");
export const PORTAL_ROOT = resolve(REPO_ROOT, "primecare-portal");
export const ENFORCEMENT_ROOT = resolve(REPO_ROOT, "docs/Architecture/Enforcement");

export function readText(absPath) {
  if (!existsSync(absPath)) return "";
  return readFileSync(absPath, "utf8");
}

export function readJson(relFromEnforcement) {
  const path = resolve(ENFORCEMENT_ROOT, relFromEnforcement);
  return JSON.parse(readText(path));
}

export function walkFiles(dir, { extensions = null, skipDirs = new Set(["node_modules", "dist", ".git"]) } = {}) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (!skipDirs.has(name)) walkFiles(path, { extensions, skipDirs }).forEach((f) => out.push(f));
    } else if (!extensions || extensions.some((ext) => name.endsWith(ext))) {
      out.push(path);
    }
  }
  return out;
}

export function rel(path) {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

export function getChangedFiles({ staged = false, base = "HEAD" } = {}) {
  try {
    const flag = staged ? "--cached" : "";
    const out = execSync(`git diff ${flag} --name-only ${base}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    if (!out) return [];
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function fileMatchesScope(filePath, scopeFiles) {
  if (!scopeFiles?.length) return true;
  const norm = filePath.replace(/\\/g, "/");
  return scopeFiles.some((f) => norm === f || norm.endsWith(`/${f}`) || norm.includes(f));
}

export function parseBlueprintTables(blueprintSchemaText) {
  const tables = new Set();
  for (const m of blueprintSchemaText.matchAll(/^##\s+([a-z_][a-z0-9_]*)\s*$/gim)) {
    tables.add(m[1].toLowerCase());
  }
  return tables;
}

export function parseFieldDictionaryFields(fieldDictText) {
  const fields = new Set();
  for (const m of fieldDictText.matchAll(/^##\s+([a-z_][a-z0-9_.]*)\s*$/gim)) {
    fields.add(m[1].toLowerCase());
  }
  return fields;
}

export function parseMigrationTables(migrationText) {
  const tables = [];
  for (const m of migrationText.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    tables.push(m[1].toLowerCase());
  }
  return tables;
}

export function parseMigrationColumns(migrationText, tableName) {
  const cols = new Set();
  const re = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?${tableName}\\s*\\(([\\s\\S]*?)\\);`,
    "i"
  );
  const block = migrationText.match(re)?.[1] || "";
  for (const m of block.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gim)) {
    const name = m[1].toLowerCase();
    if (!["constraint", "primary", "unique", "check", "foreign"].includes(name)) cols.add(name);
  }
  return cols;
}

export function parseRegistryEntries(registryText) {
  const entries = new Map();
  for (const m of registryText.matchAll(/\|\s*(PRJ-[A-Z]+-[A-Z]+-v\d+)\s*\|\s*`([^`]+)`/g)) {
    entries.set(m[2].toLowerCase(), { registry_id: m[1], table: m[2] });
  }
  for (const m of registryText.matchAll(/###\s+(PRJ-[A-Z]+-[A-Z]+-v\d+)\s+—\s+`([^`]+)`/g)) {
    entries.set(m[2].toLowerCase(), { registry_id: m[1], table: m[2] });
  }
  return entries;
}

export function parseVerifyScriptsFromMatrix(matrixText) {
  const scripts = new Set();
  for (const m of matrixText.matchAll(/verify-[a-z0-9-]+\.mjs/g)) scripts.add(m[0]);
  for (const m of matrixText.matchAll(/run-[a-z0-9-]+\.mjs/g)) scripts.add(m[0]);
  for (const m of matrixText.matchAll(/measure-[a-z0-9-]+\.mjs/g)) scripts.add(m[0]);
  return scripts;
}

export function parseGapBpItems(changelogText) {
  const gaps = [];
  for (const m of changelogText.matchAll(/\|\s*(GAP-BP-\d+)\s*\|[^|]*\|[^|]*\|\s*(OPEN|CLOSED|MITIGATED)\s*\|/g)) {
    gaps.push({ id: m[1], status: m[2] });
  }
  return gaps;
}

export function parseExportFunctions(sourceText) {
  const fns = [];
  for (const m of sourceText.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
    fns.push(m[1]);
  }
  return fns;
}

export function parseSupabaseRpcs(sqlText) {
  const rpcs = new Set();
  for (const m of sqlText.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    rpcs.add(m[1].toLowerCase());
  }
  return rpcs;
}

export function detectCycles(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function dfs(node, stack) {
    if (visiting.has(node)) {
      cycles.push([...stack, node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of adj.get(node) || []) dfs(next, [...stack, node]);
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of nodes) dfs(node, []);
  return cycles;
}

export function loadEnforcementMode() {
  return (process.env.ENFORCEMENT_MODE || "incremental").toLowerCase();
}

export function isIncrementalMode() {
  return loadEnforcementMode() !== "full";
}
