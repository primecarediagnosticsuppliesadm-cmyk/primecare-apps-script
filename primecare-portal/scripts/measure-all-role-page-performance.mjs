#!/usr/bin/env node
/**
 * Phase 1 — Measure critical API paths per role/page (QA Supabase).
 *
 * Usage: node scripts/measure-all-role-page-performance.mjs [--json]
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HQ_TENANT_ID,
  QA_LAB,
} from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const asJson = process.argv.includes("--json");

const TARGETS = {
  "HQ Admin|dashboard": 3000,
  "HQ Admin|orders": 2000,
  "HQ Admin|collections": 2000,
  "HQ Admin|logistics": 2000,
  "HQ Admin|sidebar": 4000,
  "HQ Executive|dashboard": 3000,
  "HQ Executive|executiveFi": 3000,
  "HQ Executive|sidebar": 4000,
  "Agent|dashboard": 2500,
  "Agent|collections": 2500,
  "Lab|labOrders": 2000,
  "Lab|labInvoices": 2000,
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
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function distChunkSizes() {
  const dist = resolve(root, "dist/assets");
  if (!existsSync(dist)) return { indexKb: null, chunks: [] };
  const files = readdirSync(dist).filter((f) => f.endsWith(".js"));
  const sizes = files.map((f) => {
    const kb = Math.round(statSync(join(dist, f)).size / 1024);
    return { file: f, kb };
  });
  sizes.sort((a, b) => b.kb - a.kb);
  const index = sizes.find((s) => s.file.startsWith("index-"));
  return { indexKb: index?.kb ?? null, chunks: sizes.slice(0, 12) };
}

async function instrumentedLoad(label, roleKey, pageKey, fn, ctx) {
  const failures = [];
  const tables = [];
  const rpcs = [];
  const { supabase } = ctx;

  const origFrom = supabase.from.bind(supabase);
  supabase.from = (table) => {
    tables.push(table);
    const q = origFrom(table);
    const origThen = q.then?.bind(q);
    if (origThen) {
      return Object.assign(q, {
        then(onF, onR) {
          return origThen(
            (res) => {
              if (res?.error) failures.push({ kind: "from", table, msg: res.error.message?.slice(0, 100) });
              return onF?.(res);
            },
            onR
          );
        },
      });
    }
    return q;
  };
  const origRpc = supabase.rpc.bind(supabase);
  supabase.rpc = (fnName, args) => {
    rpcs.push(fnName);
    return origRpc(fnName, args).then((res) => {
      if (res?.error) failures.push({ kind: "rpc", fn: fnName, msg: res.error.message?.slice(0, 100) });
      return res;
    });
  };

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
    failures.push({ kind: "throw", msg: detail });
  }
  const apiMs = Math.round(performance.now() - t0);

  const forbidden = tables.filter((t) => t === "order_items" || t === "order_lines");
  const founder = rpcs.includes("get_founder_snapshot");
  let blocker = "—";
  if (forbidden.length) blocker = `order_items/order_lines (${forbidden.length})`;
  else if (founder) blocker = "get_founder_snapshot";
  else if (failures.length) blocker = failures[0].msg || failures[0].table || "api error";
  else if (!ok) blocker = detail || "readFailed";

  const targetKey = `${roleKey}|${pageKey}`;
  const targetMs = TARGETS[targetKey] ?? 3000;

  return {
    role: roleKey,
    page: pageKey,
    apiMs,
    renderMs: "—",
    failedCalls: failures.length,
    blocker,
    targetMs,
    ok: ok && failures.length === 0 && !forbidden.length && !founder,
    status: apiMs <= targetMs ? "PASS" : apiMs <= targetMs * 1.2 ? "WARN" : "FAIL",
    tables: [...new Set(tables)],
    rpcs: [...new Set(rpcs)],
  };
}

async function main() {
  loadEnv();
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const ctx = {
    supabase: (await server.ssrLoadModule("/src/api/supabaseClient.js")).supabase,
    api: await server.ssrLoadModule("/src/api/primecareSupabaseApi.js"),
    sidebar: await server.ssrLoadModule("/src/api/sidebarSummaryApi.js"),
    logistics: await server.ssrLoadModule("/src/api/logisticsSupabaseApi.js"),
    invoice: await server.ssrLoadModule("/src/api/invoiceSupabaseApi.js"),
    efi: await server.ssrLoadModule("/src/founder/executiveFinancialIntelligenceData.js"),
    ops: await server.ssrLoadModule("/src/operations/operationsCommandCenterLoader.js"),
  };

  const rows = [];
  const tenantId = QA_HQ_TENANT_ID;

  async function signIn(cred, options = {}) {
    const auth = await signInWithQaCredentials(ctx.supabase, cred, options);
    if (!auth.ok) throw new Error(auth.error);
  }

  const adminUser = {
    id: "probe-admin",
    role: "admin",
    tenantId,
    tenant_id: tenantId,
  };
  const execUser = { ...adminUser, id: "probe-exec", role: "executive" };
  const agentUser = { ...adminUser, id: "probe-agent", role: "agent" };
  const labUser = { ...adminUser, id: "probe-lab", role: "lab", labId: "QA_LAB_001" };

  await signIn(QA_ADMIN);
  rows.push(
    await instrumentedLoad("admin-dashboard", "HQ Admin", "dashboard", () =>
      ctx.api.getAdminDashboardRead({ force: true }), ctx)
  );
  rows.push(
    await instrumentedLoad("admin-orders", "HQ Admin", "orders", () =>
      ctx.api.getOrdersRead({ force: true }), ctx)
  );
  rows.push(
    await instrumentedLoad("admin-collections", "HQ Admin", "collections", () =>
      ctx.api.getCollectionsRead({ force: true }), ctx)
  );
  rows.push(
    await instrumentedLoad("admin-logistics", "HQ Admin", "logistics", () =>
      ctx.logistics.getLogisticsShipmentsRead({ tenantId }), ctx)
  );
  rows.push(
    await instrumentedLoad("admin-sidebar", "HQ Admin", "sidebar", () =>
      ctx.sidebar.getSidebarSummary({ tenantId, role: "admin", force: true }), ctx)
  );

  await signIn(QA_EXECUTIVE);
  rows.push(
    await instrumentedLoad("exec-dashboard", "HQ Executive", "dashboard", () =>
      ctx.api.getAdminDashboardRead({ force: true }), ctx)
  );
  rows.push(
    await instrumentedLoad("exec-efi", "HQ Executive", "executiveFi", () =>
      ctx.efi.loadExecutiveFinancialIntelligenceData(execUser, { force: true }), ctx)
  );
  rows.push(
    await instrumentedLoad("exec-sidebar", "HQ Executive", "sidebar", () =>
      ctx.sidebar.getSidebarSummary({ tenantId, role: "executive", force: true }), ctx)
  );

  await signIn(QA_AGENT, { fallbackEmail: "qa.agent@primecare.test", repairAgent: true });
  rows.push(
    await instrumentedLoad("agent-dashboard", "Agent", "dashboard", () =>
      ctx.api.getAgentWorkspaceRead(agentUser, { force: true }), ctx)
  );
  rows.push(
    await instrumentedLoad("agent-collections", "Agent", "collections", () =>
      ctx.api.getCollectionsRead({ force: true }), ctx)
  );

  await signIn(QA_LAB);
  rows.push(
    await instrumentedLoad("lab-ordering", "Lab", "labOrders", () =>
      ctx.api.getLabCatalogRead({ tenantId, labId: "QA_LAB_001", force: true }), ctx)
  );
  rows.push(
    await instrumentedLoad("lab-invoices", "Lab", "labInvoices", () =>
      ctx.invoice.getInvoicesForLabRead("QA_LAB_001"), ctx)
  );

  await server.close();

  const bundle = distChunkSizes();

  if (asJson) {
    console.log(JSON.stringify({ rows, bundle }, null, 2));
    return;
  }

  console.log("\n# All-role page performance (API critical path)\n");
  console.log(
    "| Role | Page | API ms | Render ms | Failed | Blocker | Target ms | Status |"
  );
  console.log("|------|------|--------|-----------|--------|---------|-----------|--------|");
  for (const r of rows) {
    console.log(
      `| ${r.role} | ${r.page} | ${r.apiMs} | ${r.renderMs} | ${r.failedCalls} | ${r.blocker.slice(0, 40)} | ${r.targetMs} | ${r.status} |`
    );
  }

  console.log("\n## Bundle (post-build)\n");
  if (bundle.indexKb != null) {
    console.log(`- index chunk: **${bundle.indexKb} KB**`);
    console.log("- top chunks:");
    for (const c of bundle.chunks) console.log(`  - ${c.file}: ${c.kb} KB`);
  } else {
    console.log("- Run `npm run build` first for bundle sizes");
  }

  console.log("\n## Projection adapter readiness (flags OFF — no flip)\n");
  console.log("| Adapter | QA enable when |");
  console.log("|---------|----------------|");
  console.log("| Orders | parity PASS + staleness PASS + security PASS |");
  console.log("| Receivables | parity PASS + staleness PASS |");
  console.log("| Dashboard | verify-dashboard-projection-parity PASS |");
  console.log("| Executive | verify-executive-projection-parity PASS |");

  const failCount = rows.filter((r) => r.status === "FAIL" || !r.ok).length;
  console.log(`\nOverall: ${failCount ? "NO-GO" : "GO"} (${failCount} critical failures)\n`);
  if (failCount) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
