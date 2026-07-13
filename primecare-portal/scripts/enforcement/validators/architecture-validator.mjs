#!/usr/bin/env node
/**
 * Architecture Validator — tables, fields, projections, KPIs, domains, adapters, duplicate logic.
 */
import {
  ENFORCEMENT_ROOT,
  PORTAL_ROOT,
  REPO_ROOT,
  getChangedFiles,
  isIncrementalMode,
  parseBlueprintTables,
  parseFieldDictionaryFields,
  parseMigrationTables,
  parseRegistryEntries,
  readJson,
  readText,
  rel,
  walkFiles,
} from "../lib/fs-utils.mjs";
import { ValidationReport, shouldEnforceFinding } from "../lib/report.mjs";

export async function runArchitectureValidator(options = {}) {
  const report = new ValidationReport("Architecture");
  const incremental = options.incremental ?? isIncrementalMode();
  const scopeFiles = options.scopeFiles ?? (incremental ? getChangedFiles({ staged: options.staged }) : []);

  if (incremental && !scopeFiles.length) {
    report.info("ARCH-SKIP", "No changed files in scope — architecture checks skipped");
    return report;
  }

  const blueprintSchema = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/01_Database_Schema.md`);
  const fieldDict = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/03_Field_Dictionary.md`);
  const registryText = readText(`${REPO_ROOT}/docs/Architecture/Projection_Registry.md`);
  const neverBreak = readText(`${PORTAL_ROOT}/docs/PrimeCare_System_Blueprint/15_Do_Not_Break_Rules.md`);

  const blueprintTables = parseBlueprintTables(blueprintSchema);
  const fieldEntries = parseFieldDictionaryFields(fieldDict);
  const registryEntries = parseRegistryEntries(registryText);
  let allowlist = { undocumented_tables_pending_blueprint: [], projection_bypass_shadow_ok: true };
  try {
    allowlist = readJson("Enforcement_Allowlist.json");
  } catch {
    /* optional */
  }
  const allowTables = new Set((allowlist.undocumented_tables_pending_blueprint || []).map((t) => t.toLowerCase()));

  let kpiCatalog;
  try {
    kpiCatalog = readJson("KPI_Catalog.json");
  } catch (e) {
    report.error("ARCH-KPI-CATALOG", `Missing or invalid KPI_Catalog.json: ${e.message}`);
    kpiCatalog = { kpis: [] };
  }

  const domainApiMap = readJson("Domain_API_Map.json");
  const screenAdapterMap = readJson("Screen_Adapter_Map.json");

  // --- KPI single owner ---
  const ownerCounts = new Map();
  for (const kpi of kpiCatalog.kpis || []) {
    const owner = kpi.owner_registry_id;
    if (!owner) {
      report.error("KPI-MISSING-OWNER", `KPI ${kpi.id} (${kpi.name}) has no owner_registry_id`);
      continue;
    }
    if (!ownerCounts.has(kpi.name)) ownerCounts.set(kpi.name, []);
    ownerCounts.get(kpi.name).push(kpi.id);
  }
  for (const [name, ids] of ownerCounts) {
    if (ids.length > 1) {
      report.error("KPI-DUPLICATE-OWNER", `KPI "${name}" has multiple catalog entries: ${ids.join(", ")}`);
    }
  }

  // --- New tables in migrations ---
  const migrationDir = `${PORTAL_ROOT}/supabase/migrations`;
  const migrationFiles = walkFiles(migrationDir, { extensions: [".sql"] });
  const allMigrationTables = new Map();

  for (const file of migrationFiles) {
    const text = readText(file);
    for (const table of parseMigrationTables(text)) {
      if (!allMigrationTables.has(table)) allMigrationTables.set(table, file);
    }
  }

  for (const [table, file] of allMigrationTables) {
    const fileRel = rel(file);
    if (table.startsWith("proj_")) {
      if (!registryEntries.has(table)) {
        const msg = `Projection table "${table}" not in Projection Registry`;
        if (shouldEnforceFinding(fileRel, scopeFiles, "error", incremental)) report.error("PRJ-UNREGISTERED-TABLE", msg, { file: fileRel });
        else report.warn("PRJ-UNREGISTERED-TABLE", msg, { file: fileRel });
      } else {
        report.pass("PRJ-REGISTERED", `${table} → ${registryEntries.get(table).registry_id}`);
      }
      continue;
    }

    if (!blueprintTables.has(table)) {
      if (allowTables.has(table)) {
        report.info("ARCH-UNDOC-TABLE-ALLOW", `Table "${table}" pending Blueprint 01 documentation`);
        continue;
      }
      const msg = `Table "${table}" in migration but not documented in Blueprint 01`;
      if (shouldEnforceFinding(fileRel, scopeFiles, "error", incremental)) report.error("ARCH-UNDOC-TABLE", msg, { file: fileRel });
      else report.warn("ARCH-UNDOC-TABLE", msg, { file: fileRel });
    }
  }

  // --- Field dictionary for new columns in changed migrations ---
  if (scopeFiles.length) {
    for (const file of migrationFiles) {
      const fileRel = rel(file);
      if (incremental && !scopeFiles.some((s) => fileRel.endsWith(s) || s.endsWith(fileRel))) continue;
      const text = readText(file);
      for (const m of text.matchAll(/ALTER\s+TABLE\s+(?:public\.)?([a-z_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi)) {
        const table = m[1].toLowerCase();
        const col = m[2].toLowerCase();
        const fieldKey = `${table}.${col}`;
        if (!fieldEntries.has(fieldKey) && !fieldEntries.has(col)) {
          report.warn("ARCH-UNDOC-FIELD", `New column ${fieldKey} — add to Field Dictionary 03 or 01`, { file: fileRel });
        }
      }
    }
  }

  // --- API domain ownership ---
  const apiFiles = walkFiles(`${PORTAL_ROOT}/src/api`, { extensions: [".js", ".jsx"] });
  const knownApis = new Set();
  for (const domain of Object.values(domainApiMap.domains || {})) {
    for (const fn of [...(domain.read || []), ...(domain.write || [])]) knownApis.add(fn);
  }

  for (const file of apiFiles) {
    const text = readText(file);
    const fileRel = rel(file);
    if (incremental && !scopeFiles.some((s) => fileRel.endsWith(s))) continue;
    for (const fn of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
      const name = fn[1];
      if (!/(Read|Write|V1)$/.test(name) && !knownApis.has(name)) continue;
      if (/(Read|Write)$/.test(name) && !knownApis.has(name)) {
        report.warn("API-UNDOC-DOMAIN", `API "${name}" not in Domain_API_Map.json`, { file: fileRel });
      }
    }
  }

  // --- Screen adapter / transactional bypass ---
  const pageFiles = walkFiles(`${PORTAL_ROOT}/src/pages`, { extensions: [".jsx", ".js"] });
  for (const screen of screenAdapterMap.screens || []) {
    const pageFile = pageFiles.find((p) => p.endsWith(screen.component));
    if (!pageFile) continue;
    const text = readText(pageFile);
    const fileRel = rel(pageFile);
    for (const forbidden of screen.forbidden_when_projection_active || []) {
      if (text.includes(forbidden.replace(/\\"/g, '"'))) {
        const msg = `${screen.component} contains forbidden pattern "${forbidden}" when projection ${screen.projection_registry_id} exists — use ${screen.preferred_when_flag_on}`;
        const severity = allowlist.projection_bypass_shadow_ok ? "warn" : "error";
        if (shouldEnforceFinding(fileRel, scopeFiles, severity === "error" ? "error" : "warn", incremental)) {
          report[severity]("ARCH-PROJECTION-BYPASS", msg, { file: fileRel });
        }
      }
    }
  }

  // --- Duplicate client KPI engines ---
  const metricsFiles = walkFiles(`${PORTAL_ROOT}/src/metrics`, { extensions: [".js"] });
  const computeFns = new Map();
  for (const file of metricsFiles) {
    const text = readText(file);
    const fileRel = rel(file);
    for (const m of text.matchAll(/export\s+function\s+(compute[A-Za-z0-9_]+)/g)) {
      const fn = m[1];
      if (!computeFns.has(fn)) computeFns.set(fn, []);
      computeFns.get(fn).push(fileRel);
    }
  }
  for (const [fn, files] of computeFns) {
    if (files.length > 1) {
      report.error("ARCH-DUPLICATE-METRICS", `Duplicate KPI engine "${fn}" in: ${files.join(", ")}`);
    }
  }

  if (scopeFiles.length) {
    for (const file of scopeFiles) {
      if (!file.includes("src/metrics/") && !file.endsWith(".jsx")) continue;
      const abs = `${REPO_ROOT}/${file}`;
      const text = readText(abs);
      if (text.includes("export function compute") && file.includes("src/metrics/")) {
        report.warn("ARCH-CLIENT-KPI-NEW", `New client KPI engine in ${file} — prefer domain metric projection (TD-014)`, { file });
      }
    }
  }

  // --- Never-break touch detection ---
  const neverBreakKeywords = ["orders.status", "invoice_payment_allocations", "ar_credit_control", "inventory_ledger"];
  for (const file of scopeFiles) {
    if (!file.match(/\.(sql|js|jsx)$/)) continue;
    const abs = `${REPO_ROOT}/${file}`;
    const text = readText(abs);
    for (const kw of neverBreakKeywords) {
      if (text.includes(kw) && (file.includes("migration") || file.includes("supabase"))) {
        report.warn("ARCH-NEVER-BREAK-TOUCH", `Changed file touches never-break surface "${kw}" — requires ARB review`, { file });
      }
    }
  }

  if (!report.failed() && report.stats.error === 0) {
    report.pass("ARCH-OK", "Architecture validator completed");
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runArchitectureValidator();
  report.print();
  process.exit(report.failed() ? 1 : 0);
}
