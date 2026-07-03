#!/usr/bin/env node
/**
 * Static + optional runtime gate: Admin Dashboard must not bulk-read order_lines/order_items.
 *
 * Usage: node scripts/verify-admin-dashboard-no-transactional-lines.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const FORBIDDEN_IN_DASHBOARD_LOAD = [
  "fetchOrderLineMetricsForOrders",
  "fetchOrderLineMetricsForOrdersBounded",
  'from("order_items")',
  'from("order_lines")',
  ".from('order_items')",
  ".from('order_lines')",
  "queryOrderLinesChunk",
];

const REQUIRED_IN_DASHBOARD_LOAD = ["fetchDashboardLineMetricsFromProjection"];

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}

function skip(msg) {
  console.log(`SKIP  ${msg}`);
}

function extractFunctionBody(source, fnName) {
  const start = source.indexOf(`async function ${fnName}`);
  if (start < 0) return "";
  // Skip the parameter list so default values like `scope = {}` don't get counted
  // as the function body opener.
  let parenDepth = 0;
  let bodyOpen = -1;
  for (let i = source.indexOf("(", start); i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyOpen = source.indexOf("{", i);
        break;
      }
    }
  }
  if (bodyOpen < 0) return "";
  let depth = 0;
  for (let i = bodyOpen; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyOpen, i + 1);
    }
  }
  return "";
}

function staticCheck() {
  console.log("\n--- Static: Admin Dashboard bounded load path ---\n");

  const hqPath = resolve(root, "src/api/hqBoundedReads.js");
  const hqSrc = readFileSync(hqPath, "utf8");
  const loadBody = extractFunctionBody(hqSrc, "loadAdminDashboardBoundedSourceRows");
  if (!loadBody) {
    fail("loadAdminDashboardBoundedSourceRows not found");
    return;
  }

  for (const token of FORBIDDEN_IN_DASHBOARD_LOAD) {
    if (loadBody.includes(token)) {
      fail(`loadAdminDashboardBoundedSourceRows references forbidden token: ${token}`);
    } else {
      pass(`no ${token} in dashboard bounded load`);
    }
  }

  for (const token of REQUIRED_IN_DASHBOARD_LOAD) {
    if (loadBody.includes(token)) {
      pass(`uses ${token}`);
    } else {
      fail(`missing required ${token} in dashboard bounded load`);
    }
  }

  const apiPath = resolve(root, "src/api/primecareSupabaseApi.js");
  const apiSrc = readFileSync(apiPath, "utf8");
  const getAdminStart = apiSrc.indexOf("export async function getAdminDashboardRead");
  const getAdminSlice = getAdminStart >= 0 ? apiSrc.slice(getAdminStart, getAdminStart + 12000) : "";
  if (!getAdminSlice) {
    fail("getAdminDashboardRead not found");
    return;
  }

  for (const token of [
    "fetchOrderLineMetricsForOrders",
    "fetchOrderUnitCountsForOrders",
    'from("order_items")',
    'from("order_lines")',
  ]) {
    if (getAdminSlice.includes(token)) {
      fail(`getAdminDashboardRead references forbidden token: ${token}`);
    } else {
      pass(`getAdminDashboardRead does not reference ${token}`);
    }
  }

  if (getAdminSlice.includes("fetchAdminDashboardBoundedSourceRows")) {
    pass("getAdminDashboardRead uses bounded source loader");
  } else {
    fail("getAdminDashboardRead missing fetchAdminDashboardBoundedSourceRows");
  }

  console.log("\n--- Static: Sidebar summary (Admin shell badges) ---\n");
  const sidebarPath = resolve(root, "src/api/sidebarSummaryApi.js");
  const sidebarSrc = readFileSync(sidebarPath, "utf8");
  for (const token of [
    "loadOperationsCommandCenterData",
    "loadExecutiveActionQueueEnrichment",
    "get_founder_snapshot",
    "getFounderSnapshotRead",
  ]) {
    if (sidebarSrc.includes(token)) {
      fail(`sidebarSummaryApi references forbidden token: ${token}`);
    } else {
      pass(`sidebarSummaryApi does not reference ${token}`);
    }
  }
  if (sidebarSrc.includes("getOrdersRead({ skipLineCounts: true })")) {
    pass("sidebarSummaryApi uses skipLineCounts orders read");
  } else {
    fail("sidebarSummaryApi missing getOrdersRead({ skipLineCounts: true })");
  }
}

async function runtimeCheck() {
  console.log("\n--- Runtime: Admin Dashboard critical path ---\n");

  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    skip("runtime — missing .env.local");
    return;
  }

  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
    const { getAdminDashboardRead } = await server.ssrLoadModule(
      "/src/api/primecareSupabaseApi.js"
    );
    const { getSidebarSummary } = await server.ssrLoadModule("/src/api/sidebarSummaryApi.js");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: QA_ADMIN.email,
      password: QA_ADMIN.password,
    });
    if (signInError) {
      skip(`runtime — auth failed: ${signInError.message}`);
      return;
    }

    const observedTables = [];
    const observedRpcs = [];
    const failures = [];
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
      observedTables.push(table);
      const q = originalFrom(table);
      const origThen = q.then?.bind(q);
      if (origThen) {
        return Object.assign(q, {
          then(onF, onR) {
            return origThen(
              (res) => {
                if (res?.error) {
                  failures.push({ kind: "from", table, msg: res.error.message?.slice(0, 120) });
                }
                return onF?.(res);
              },
              onR
            );
          },
        });
      }
      return q;
    };
    const originalRpc = supabase.rpc.bind(supabase);
    supabase.rpc = (fn, args) => {
      observedRpcs.push(fn);
      return originalRpc(fn, args).then((res) => {
        if (res?.error) failures.push({ kind: "rpc", fn, msg: res.error.message?.slice(0, 120) });
        return res;
      });
    };

    const dashT0 = performance.now();
    const result = await getAdminDashboardRead({ force: true });
    const dashMs = Math.round(performance.now() - dashT0);

    const dashForbidden = observedTables.filter((t) => t === "order_items" || t === "order_lines");
    if (dashForbidden.length) {
      fail(`dashboard read observed forbidden tables: ${[...new Set(dashForbidden)].join(", ")}`);
    } else {
      pass(`dashboard read — no order_items/order_lines (${dashMs} ms)`);
    }

    if (observedRpcs.includes("get_founder_snapshot")) {
      fail("dashboard read invoked get_founder_snapshot");
    } else {
      pass("dashboard read — no get_founder_snapshot");
    }

    if (result?.readFailed) {
      fail(`getAdminDashboardRead readFailed: ${result.error || "unknown"}`);
    } else {
      pass("getAdminDashboardRead succeeded");
    }

    if (dashMs <= 3000) {
      pass(`dashboard read timing — ${dashMs} ms (target ≤3000 ms)`);
    } else {
      fail(`dashboard read timing — ${dashMs} ms exceeds 3000 ms target`);
    }

    const sidebarT0 = performance.now();
    await getSidebarSummary({ tenantId: QA_HQ_TENANT_ID, role: "admin", force: true });
    const sidebarMs = Math.round(performance.now() - sidebarT0);
    const sidebarForbidden = observedTables.filter((t) => t === "order_items" || t === "order_lines");
    if (sidebarForbidden.length) {
      fail(`sidebar summary observed forbidden tables: ${[...new Set(sidebarForbidden)].join(", ")}`);
    } else {
      pass(`sidebar summary — no order_items/order_lines (${sidebarMs} ms deferred load)`);
    }
    if (observedRpcs.includes("get_founder_snapshot")) {
      fail("sidebar summary invoked get_founder_snapshot");
    } else {
      pass("sidebar summary — no get_founder_snapshot");
    }

    const founderFailures = failures.filter((f) => f.fn === "get_founder_snapshot");
    if (founderFailures.length) {
      fail(`get_founder_snapshot errors: ${founderFailures.map((f) => f.msg).join("; ")}`);
    } else {
      pass("no get_founder_snapshot RPC failures on admin route simulation");
    }

    if (QA_HQ_TENANT_ID) {
      pass(`runtime tenant context — ${QA_HQ_TENANT_ID}`);
    }
  } finally {
    await server.close();
  }
}

async function main() {
  console.log("\n=== Admin Dashboard — no transactional line table fan-out ===\n");
  staticCheck();
  await runtimeCheck();
  console.log("\n=== Verification complete ===\n");
  if (process.exitCode) {
    console.log("Overall: NO-GO\n");
  } else {
    console.log("Overall: GO (dashboard path avoids order_items/order_lines bulk reads)\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
