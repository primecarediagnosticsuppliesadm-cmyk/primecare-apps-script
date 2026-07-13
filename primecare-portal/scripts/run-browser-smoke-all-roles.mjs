#!/usr/bin/env node
/**
 * Phase 6 — API-path smoke per role (no Playwright; simulates critical route loads).
 *
 * Usage: node scripts/run-browser-smoke-all-roles.mjs
 */
import { createServer } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  process.exitCode = 1;
}

async function smokeRole(label, cred, probes, ctx, signInOptions = {}) {
  const auth = await signInWithQaCredentials(ctx.supabase, cred, signInOptions);
  if (!auth.ok) {
    fail(`${label}.auth`, auth.error);
    return;
  }
  pass(`${label}.auth`, auth.email);

  for (const probe of probes) {
    const tables = [];
    const rpcs = [];
    const origFrom = ctx.supabase.from.bind(ctx.supabase);
    ctx.supabase.from = (table) => {
      tables.push(table);
      return origFrom(table);
    };
    const origRpc = ctx.supabase.rpc.bind(ctx.supabase);
    ctx.supabase.rpc = (fn, args) => {
      rpcs.push(fn);
      return origRpc(fn, args);
    };

    const t0 = performance.now();
    let res;
    try {
      res = await probe.run(ctx);
    } catch (err) {
      fail(`${label}.${probe.id}`, err?.message || String(err));
      continue;
    }
    const ms = Math.round(performance.now() - t0);

    if (res?.readFailed || res?.success === false) {
      fail(`${label}.${probe.id}`, res?.error || "readFailed");
      continue;
    }

    const badTables = tables.filter((t) => t === "order_items" || t === "order_lines");
    if (badTables.length && probe.allowLineTables !== true) {
      fail(`${label}.${probe.id}`, `forbidden tables: ${[...new Set(badTables)].join(", ")}`);
      continue;
    }
    if (rpcs.includes("get_founder_snapshot") && probe.allowFounder !== true) {
      fail(`${label}.${probe.id}`, "forbidden get_founder_snapshot on critical path");
      continue;
    }
    if (ms > probe.maxMs) {
      fail(`${label}.${probe.id}`, `${ms}ms exceeds ${probe.maxMs}ms target`);
      continue;
    }

    pass(`${label}.${probe.id}`, `${ms}ms — ${probe.route}`);
  }
}

async function main() {
  console.log("\n=== Browser smoke (API critical paths) ===\n");

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
  };

  const tenantId = QA_HQ_TENANT_ID;
  const adminUser = { role: "admin", tenantId, tenant_id: tenantId, id: "smoke" };
  const execUser = { ...adminUser, role: "executive" };
  const agentUser = { ...adminUser, role: "agent" };

  await smokeRole(
    "admin",
    QA_ADMIN,
    [
      {
        id: "dashboard",
        route: "login → dashboard",
        maxMs: 3000,
        run: (c) => c.api.getAdminDashboardRead({ force: true }),
      },
      {
        id: "orders",
        route: "admin → orders",
        maxMs: 4000,
        run: (c) => c.api.getOrdersRead({ force: true }),
        allowLineTables: true,
      },
      {
        id: "logistics",
        route: "admin → logistics",
        maxMs: 2000,
        run: (c) => c.logistics.getLogisticsShipmentsRead({ tenantId }),
      },
    ],
    ctx
  );

  await smokeRole(
    "executive",
    QA_EXECUTIVE,
    [
      {
        id: "efi",
        route: "executive → EFI",
        maxMs: 12000,
        run: (c) => c.efi.loadExecutiveFinancialIntelligenceData(execUser, { force: true }),
        allowFounder: true,
        allowLineTables: true,
      },
    ],
    ctx
  );

  await smokeRole(
    "lab",
    QA_LAB,
    [
      {
        id: "ordering",
        route: "lab → ordering",
        maxMs: 2000,
        run: (c) => c.api.getLabCatalogRead({ tenantId, labId: "QA_LAB_001", force: true }),
      },
      {
        id: "invoices",
        route: "lab → invoice center",
        maxMs: 2000,
        run: (c) => c.invoice.getInvoicesForLabRead("QA_LAB_001"),
      },
    ],
    ctx
  );

  await smokeRole(
    "agent",
    QA_AGENT,
    [
      {
        id: "dashboard",
        route: "agent → dashboard",
        maxMs: 2500,
        run: (c) => c.api.getAgentWorkspaceRead(agentUser, { force: true }),
      },
      {
        id: "collections",
        route: "agent → collections",
        maxMs: 2500,
        run: (c) => c.api.getCollectionsRead({ force: true }),
      },
    ],
    ctx,
    { fallbackEmail: "qa.agent@primecare.test", repairAgent: true }
  );

  await server.close();

  console.log("\n=== Smoke complete ===\n");
  if (process.exitCode) console.log("Overall: NO-GO\n");
  else console.log("Overall: GO\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
