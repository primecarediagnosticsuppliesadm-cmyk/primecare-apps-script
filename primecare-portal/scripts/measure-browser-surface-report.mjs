#!/usr/bin/env node
/**
 * Browser surface performance report — API cold reads + ranked slowest operations.
 * Browser FCP/LCP/render timings come from QA Diagnostics panel in-app.
 *
 * Usage: node scripts/measure-browser-surface-report.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";
import { QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SURFACE_TARGETS = {
  "admin-dashboard": 350,
  "orders-list": 350,
  collections: 200,
  "executive-fi-sidebar": 400,
  "logistics-shipments": 400,
  "lab-invoices": 300,
};

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

async function timed(label, fn) {
  const t0 = performance.now();
  const res = await fn();
  return { label, ms: Math.round(performance.now() - t0), ok: res?.success !== false, res };
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
  const sidebarApi = await server.ssrLoadModule("/src/api/sidebarSummaryApi.js");
  const logisticsApi = await server.ssrLoadModule("/src/api/logisticsSupabaseApi.js");
  const invoiceApi = await server.ssrLoadModule("/src/api/invoiceSupabaseApi.js");
  await server.close();

  const rows = [];

  await supabase.auth.signInWithPassword({ email: "qa.admin@primecare.test", password: "1234" });

  rows.push(await timed("admin-dashboard", () => api.getAdminDashboardRead({ force: true })));
  rows.push(await timed("orders-list", () => api.getOrdersRead({ force: true })));
  rows.push(await timed("collections", () => api.getCollectionsRead()));
  rows.push(
    await timed("logistics-shipments", () =>
      logisticsApi.getLogisticsShipmentsRead({ tenantId: QA_HQ_TENANT_ID })
    )
  );

  await supabase.auth.signOut();
  await supabase.auth.signInWithPassword({ email: "qa.executive@primecare.test", password: "1234" });
  rows.push(await timed("executive-fi-sidebar", () => sidebarApi.getSidebarSummary({ force: true })));

  await supabase.auth.signOut();
  await supabase.auth.signInWithPassword({ email: "qa.lab@primecare.test", password: "1234" });
  rows.push(
    await timed("lab-invoices", () => invoiceApi.getInvoicesForLabRead("QA_LAB_001"))
  );

  rows.sort((a, b) => b.ms - a.ms);

  console.log("\n# Browser Surface Performance Report\n");
  console.log("| Rank | Surface | API ms | Target | Status |");
  console.log("|------|---------|--------|--------|--------|");
  rows.forEach((row, idx) => {
    const target = SURFACE_TARGETS[row.label] || 400;
    const status = row.ms <= target ? "PASS" : row.ms <= target * 1.15 ? "WARN" : "FAIL";
    console.log(`| ${idx + 1} | ${row.label} | ${row.ms} | ${target} | ${status} |`);
  });

  console.log("\n## Top 10 slowest API operations\n");
  rows.slice(0, 10).forEach((row, idx) => {
    console.log(`${idx + 1}. ${row.label} — ${row.ms}ms`);
  });

  console.log("\n## Browser timings (in-app)\n");
  console.log(
    "Open QA Diagnostics panel (QA env) on Dashboard, Orders, Executive FI, Logistics, Lab Invoice Center."
  );
  console.log("Records: FCP, LCP, page render-ready, API/RPC timings (top 10 slowest).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
