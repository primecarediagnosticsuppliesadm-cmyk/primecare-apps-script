#!/usr/bin/env node
/**
 * Generate Projection Operations Center report (JSON + Markdown).
 * Usage: node scripts/generate-projection-ops-report.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "docs/QA");

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function loadCatalog() {
  return JSON.parse(
    readFileSync(resolve(root, "src/projectionOps/projectionOpsCatalog.json"), "utf8")
  );
}

function buildReport(catalog, metaRows) {
  const now = Date.now();
  const metaById = new Map((metaRows || []).map((r) => [r.registry_id, r]));
  const projections = (catalog.projections || []).map((entry) => {
    const meta = metaById.get(entry.registryId);
    const asOf = meta?.as_of ? new Date(meta.as_of).getTime() : NaN;
    const freshnessMs = Number.isFinite(asOf) ? Math.max(0, now - asOf) : null;
    const sla = entry.stalenessSlaMs;
    let freshnessStatus = "UNKNOWN";
    if (freshnessMs != null && sla) {
      freshnessStatus = freshnessMs <= sla ? "PASS" : freshnessMs <= sla * 1.25 ? "WARN" : "FAIL";
    }
    return {
      registryId: entry.registryId,
      status: entry.status,
      rowCount: Number(meta?.row_count ?? 0),
      freshnessMs,
      freshnessStatus,
      lastRebuild: meta?.as_of ?? null,
      refreshDurationMs: null,
      parityStatus: meta?.last_error ? "FAIL" : meta ? "UNKNOWN" : "SKIP",
      failureCount: meta?.last_error ? 1 : 0,
      shadowStatus: `${entry.status}-off`,
      featureFlag: entry.featureFlag,
      featureFlagStatus: entry.featureFlag ? "OFF" : "N/A",
      lastError: meta?.last_error ?? null,
    };
  });

  const freshFail = projections.filter((p) => p.freshnessStatus === "FAIL").length;
  const errors = projections.filter((p) => p.lastError).length;
  let overall = "GO";
  if (freshFail > 0 || errors > 0) overall = "NO-GO";
  else if (projections.some((p) => p.freshnessStatus === "WARN")) overall = "WARN";

  return {
    generated_at: new Date().toISOString(),
    tenant_id: QA_HQ_TENANT_ID,
    overall,
    projections,
    summary: {
      total: projections.length,
      freshFail,
      activeErrors: errors,
      shadowMode: true,
    },
  };
}

async function main() {
  console.log("\n=== Generate projection ops report ===\n");
  const env = loadEnv();
  const catalog = loadCatalog();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await sb.auth.signInWithPassword({ email: QA_ADMIN.email, password: QA_ADMIN.password });

  const { data: metaRows, error } = await sb
    .from("hq_projection_meta_v1")
    .select("registry_id,as_of,row_count,last_error,updated_at")
    .eq("tenant_id", QA_HQ_TENANT_ID);

  if (error) throw new Error(error.message);

  const report = buildReport(catalog, metaRows);
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, "Projection_Ops_Report.json");
  const mdPath = resolve(outDir, "Projection_Ops_Report.md");

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    "# Projection Operations Report",
    "",
    `Generated: ${report.generated_at}`,
    `Tenant: ${report.tenant_id}`,
    `Overall: **${report.overall}**`,
    "",
    "| Registry | Rows | Freshness | Parity | Shadow | Flag |",
    "|----------|------|-----------|--------|--------|------|",
    ...report.projections.map(
      (p) =>
        `| ${p.registryId} | ${p.rowCount} | ${p.freshnessStatus} | ${p.parityStatus} | ${p.shadowStatus} | ${p.featureFlagStatus} |`
    ),
    "",
  ].join("\n");

  writeFileSync(mdPath, md);
  console.log(`PASS  report.json — ${jsonPath}`);
  console.log(`PASS  report.md — ${mdPath}`);
  console.log(`Overall: ${report.overall}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
