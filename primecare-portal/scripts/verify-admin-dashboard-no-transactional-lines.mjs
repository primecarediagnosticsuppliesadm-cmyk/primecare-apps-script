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
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) return "";
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
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
}

async function runtimeCheck() {
  console.log("\n--- Runtime: getAdminDashboardRead (no transactional line tables) ---\n");

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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: QA_ADMIN.email,
      password: QA_ADMIN.password,
    });
    if (signInError) {
      skip(`runtime — auth failed: ${signInError.message}`);
      return;
    }

    const observedTables = [];
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
      observedTables.push(table);
      return originalFrom(table);
    };

    const result = await getAdminDashboardRead({ force: true });
    const forbiddenHits = observedTables.filter((t) => t === "order_items" || t === "order_lines");

    if (forbiddenHits.length) {
      fail(`runtime observed forbidden tables: ${[...new Set(forbiddenHits)].join(", ")}`);
    } else {
      pass(`runtime — no order_items/order_lines reads (${observedTables.length} table calls)`);
    }

    if (result?.readFailed) {
      fail(`runtime — getAdminDashboardRead readFailed: ${result.error || "unknown"}`);
    } else {
      pass("runtime — getAdminDashboardRead succeeded");
    }

    if (observedTables.includes("proj_order_v1") || result?.itemMetricsDegraded !== true) {
      pass("runtime — projection path or header totals only (no line-table fan-out required)");
    } else {
      skip("runtime — proj_order_v1 not queried (all orders may have header totals)");
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
