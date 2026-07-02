#!/usr/bin/env node
/**
 * Projection Validator — registry, dependencies, refresh graph, lifecycle, parity/staleness hooks.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  PORTAL_ROOT,
  REPO_ROOT,
  detectCycles,
  isIncrementalMode,
  parseRegistryEntries,
  readJson,
  readText,
  rel,
  walkFiles,
} from "../lib/fs-utils.mjs";
import { ValidationReport } from "../lib/report.mjs";

export async function runProjectionValidator(options = {}) {
  const report = new ValidationReport("Projection");
  const incremental = options.incremental ?? isIncrementalMode();
  const runLive = options.runLive ?? !incremental;

  const registryText = readText(`${REPO_ROOT}/docs/Architecture/Projection_Registry.md`);
  const registryEntries = parseRegistryEntries(registryText);
  const deps = readJson("Projection_Dependencies.json");

  const nodeIds = deps.nodes.map((n) => n.registry_id);
  const nodeById = new Map(deps.nodes.map((n) => [n.registry_id, n]));
  const cycles = detectCycles(nodeIds, deps.edges);

  if (cycles.length) {
    for (const cycle of cycles) {
      report.error("PRJ-CYCLE-DETECTED", `Dependency cycle: ${cycle.join(" → ")}`);
    }
  } else {
    report.pass("PRJ-ACYCLIC", "Projection dependency graph is acyclic");
  }

  // --- Registry completeness vs SQL ---
  const sqlFiles = walkFiles(`${PORTAL_ROOT}/supabase/migrations`, { extensions: [".sql"] });
  const sqlTables = new Set();
  for (const file of sqlFiles) {
    for (const m of readText(file).matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_]+)/gi)) {
      if (m[1].startsWith("proj_")) sqlTables.add(m[1].toLowerCase());
    }
  }

  for (const table of sqlTables) {
    if (!registryEntries.has(table)) {
      report.error("PRJ-UNREGISTERED-TABLE", `SQL defines ${table} but Registry has no PRJ-* entry`);
    }
  }

  for (const [table, entry] of registryEntries) {
    if (table.startsWith("proj_") && !sqlTables.has(table)) {
      const node = deps.nodes.find((n) => n.registry_id === entry.registry_id);
      if (node?.status === "planned") {
        report.info("PRJ-PLANNED-NO-SQL", `${entry.registry_id} (${table}) planned — SQL not yet deployed`);
      } else {
        report.warn("PRJ-REGISTRY-NO-SQL", `Registry lists ${table} but no migration CREATE TABLE found`);
      }
    }
  }

  // --- Meta table for active/shadow ---
  const hasMeta = [...readText(`${PORTAL_ROOT}/supabase/migrations/20260705120000_sprint2_domain_projections_phase1.sql`).matchAll(/hq_projection_meta_v1/g)].length > 0;
  if (hasMeta) report.pass("PRJ-META-TABLE", "hq_projection_meta_v1 present");
  else report.warn("PRJ-MISSING-META", "hq_projection_meta_v1 not found in Phase 1 migration");

  // --- Forbidden composite → core edges (composite must go through metrics) ---
  for (const edge of deps.edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (from?.class === "composite" && to?.class === "core") {
      report.error("PRJ-FORBIDDEN-EDGE", `Composite ${edge.from} must not depend directly on core ${edge.to}`);
    }
  }

  // --- Status transitions documented ---
  const allowed = new Set((deps.status_transitions?.allowed || []).map(([a, b]) => `${a}->${b}`));
  for (const node of deps.nodes) {
    if (node.status === "shadow" && !allowed.has("planned->shadow") && !allowed.has("shadow->active")) {
      report.info("PRJ-STATUS", `${node.registry_id} status=${node.status}`);
    }
  }

  // --- Refresh workers in SQL ---
  const refreshWorkers = new Set();
  for (const file of sqlFiles) {
    for (const m of readText(file).matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(refresh_[a-z_0-9]+)/gi)) {
      refreshWorkers.add(m[1].toLowerCase());
    }
  }
  for (const node of deps.nodes.filter((n) => n.status !== "planned")) {
    const expectedWorker = `refresh_${node.table.replace(/_v\d+$/, "")}_row_v1`.replace("proj_tenant_", "proj_tenant_");
    if (node.class === "core" && node.status === "shadow") {
      const hasWorker = [...refreshWorkers].some((w) => w.includes(node.table.replace("_v1", "").replace("proj_", "")));
      if (!hasWorker) report.warn("PRJ-MISSING-WORKER", `No refresh worker found for ${node.registry_id}`);
    }
  }

  // --- Live parity / staleness (optional) ---
  if (runLive && existsSync(`${PORTAL_ROOT}/.env.local`)) {
    for (const script of ["verify-projection-parity.mjs", "verify-projection-staleness.mjs"]) {
      try {
        execSync(`node scripts/${script}`, { cwd: PORTAL_ROOT, stdio: "pipe", encoding: "utf8" });
        report.pass("PRJ-LIVE-CERT", `${script} PASS`);
      } catch (e) {
        report.error("PRJ-LIVE-CERT-FAIL", `${script} FAIL — ${String(e.stderr || e.message).slice(0, 200)}`);
      }
    }
  } else {
    report.info("PRJ-PARITY-SKIP", "Live parity/staleness skipped (no .env.local or incremental mode)");
    report.info("PRJ-STALENESS-SKIP", "Run nightly profile for live staleness checks");
  }

  if (!report.failed()) report.pass("PRJ-OK", "Projection validator completed");
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runProjectionValidator({ runLive: process.argv.includes("--live") });
  report.print();
  process.exit(report.failed() ? 1 : 0);
}
