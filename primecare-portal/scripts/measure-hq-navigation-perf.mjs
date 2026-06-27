#!/usr/bin/env node
/**
 * HQ navigation performance probe — API-layer timings per surface (no browser).
 * Usage: node scripts/measure-hq-navigation-perf.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";
import { QA_AGENT } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;

  const accounts = {
    executive: ["qa.executive@primecare.test", "1234"],
    admin: ["qa.admin@primecare.test", "1234"],
    agent: [QA_AGENT.email, QA_AGENT.password],
    lab: ["qa.lab@primecare.test", "1234"],
  };

  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  const sidebarApi = await server.ssrLoadModule("/src/api/sidebarSummaryApi.js");
  await server.close();

  const rows = [];

  for (const [role, [email, password]] of Object.entries(accounts)) {
    const sb = createClient(url, anon);
    const loginT0 = performance.now();
    const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
    const loginMs = Math.round(performance.now() - loginT0);
    if (authErr) {
      rows.push({ role, surface: "login", ms: loginMs, ok: false, note: authErr.message });
      continue;
    }

    rows.push({ role, surface: "login", ms: loginMs, ok: true });

    const probes = [
      ["adminDashboard", () => api.getAdminDashboardRead()],
      ["orders", () => api.getOrdersRead()],
      ["collections", () => api.getCollectionsRead()],
      ["inventory", () => api.getStockDashboard()],
      ["qualification", () => api.getQualificationReviewRead()],
    ];

    if (role === "executive" || role === "admin") {
      probes.push([
        "sidebarSummary",
        () =>
          sidebarApi.getSidebarSummary({
            role,
            tenantId: "f168b98f-47a6-42c3-b788-24c00436fac2",
          }),
      ]);
    }

    for (const [surface, fn] of probes) {
      const first = await timed(surface, fn);
      rows.push({ role, surface: `${surface} (cold)`, ms: first.ms, ok: first.ok });
      const second = await timed(`${surface} (cache)`, fn);
      rows.push({ role, surface: `${surface} (warm)`, ms: second.ms, ok: second.ok });
    }
  }

  rows.sort((a, b) => b.ms - a.ms);

  console.log("# HQ Navigation Performance Probe\n");
  console.log("| Rank | Role | Surface | ms | OK |");
  console.log("|------|------|---------|-----|-----|");
  rows.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.role} | ${r.surface} | ${r.ms} | ${r.ok ? "yes" : "no"} |`);
  });

  const warm = rows.filter((r) => r.surface.includes("(warm)"));
  const slowest = warm.sort((a, b) => b.ms - a.ms)[0];
  console.log(`\nSlowest warm read: ${slowest?.role} / ${slowest?.surface} — ${slowest?.ms}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
