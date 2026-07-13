#!/usr/bin/env node
/**
 * Sprint 1 HQ read performance probe — cold API timings for key surfaces.
 * Usage: node scripts/measure-sprint1-hq-reads.mjs [--label before|after]
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const label = process.argv.includes("--after") ? "after" : "before";

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

async function timed(name, fn) {
  const t0 = performance.now();
  let ok = true;
  let detail = "";
  try {
    const res = await fn();
    ok = res?.success !== false && res?.readFailed !== true;
    if (res?.error) detail = String(res.error).slice(0, 80);
  } catch (err) {
    ok = false;
    detail = err?.message || String(err);
  }
  return { name, ms: Math.round(performance.now() - t0), ok, detail };
}

async function main() {
  loadEnv();
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  const opsLoader = await server.ssrLoadModule("/src/operations/operationsCommandCenterLoader.js");
  const efiData = await server.ssrLoadModule("/src/founder/executiveFinancialIntelligenceData.js");
  await server.close();

  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (authErr) throw authErr;

  const currentUser = {
    id: "probe",
    role: "admin",
    tenantId: "f168b98f-47a6-42c3-b788-24c00436fac2",
    tenant_id: "f168b98f-47a6-42c3-b788-24c00436fac2",
  };

  const probes = [
    ["getAdminDashboardRead", () => api.getAdminDashboardRead({ force: true })],
    ["getOrdersRead", () => api.getOrdersRead({ force: true })],
    ["getCollectionsRead", () => api.getCollectionsRead({ force: true })],
    [
      "loadOperationsCommandCenterData",
      () => opsLoader.loadOperationsCommandCenterData(currentUser, { force: true }),
    ],
  ];

  const rows = [];
  for (const [name, fn] of probes) {
    rows.push(await timed(name, fn));
  }

  await supabase.auth.signOut();
  const { error: execErr } = await supabase.auth.signInWithPassword({
    email: "qa.executive@primecare.test",
    password: "1234",
  });
  if (execErr) throw execErr;

  const execUser = { ...currentUser, role: "executive" };
  rows.push(
    await timed("loadExecutiveFinancialIntelligenceData", () =>
      efiData.loadExecutiveFinancialIntelligenceData(execUser, { force: true })
    )
  );

  rows.sort((a, b) => b.ms - a.ms);

  console.log(`# Sprint 1 HQ Read Probe (${label})\n`);
  console.log("| Rank | API | ms | OK |");
  console.log("|------|-----|-----|-----|");
  rows.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.name} | ${r.ms} | ${r.ok ? "yes" : "no"} |`);
  });
  console.log(`\nTotal sequential cold: ${rows.reduce((s, r) => s + r.ms, 0)} ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
