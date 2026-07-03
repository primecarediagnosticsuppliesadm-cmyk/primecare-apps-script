#!/usr/bin/env node
/**
 * Sprint 5 — QA database read profiler (analysis only).
 * Usage: node scripts/profile-sprint5-database.mjs [--json]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const asJson = process.argv.includes("--json");
const TENANT = QA_HQ_TENANT_ID;

function bytes(v) {
  try {
    return JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

async function timed(label, fn, meta = {}) {
  const t0 = performance.now();
  let result;
  let error;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const ms = Math.round(performance.now() - t0);
  const rowCount = meta.rowCount?.(result) ?? meta.rows?.(result) ?? null;
  const payload = bytes(result?.data ?? result);
  const errMsg = error?.message || result?.error?.message || null;
  return { label, ms, ok: !error && !result?.error, error: errMsg, rowCount, payload };
}

async function main() {
  const server = await createServer({
    root,
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
    appType: "custom",
  });
  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  const bounded = await server.ssrLoadModule("/src/api/hqBoundedReads.js");
  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const opsLoader = await server.ssrLoadModule("/src/operations/operationsCommandCenterLoader.js");
  const efiData = await server.ssrLoadModule("/src/founder/executiveFinancialIntelligenceData.js");
  const {
    recentDateYmd,
    HQ_ORDER_LIST_COLUMNS,
    HQ_AR_COLUMNS,
    HQ_PAYMENT_COLUMNS,
    HQ_DASHBOARD_ORDERS_LIMIT,
    HQ_DASHBOARD_VISITS_LIMIT,
    HQ_DASHBOARD_RECENT_DAYS,
  } = await server.ssrLoadModule("/src/api/hqReadBounds.js");
  const { fetchOrderUnitCountsForOrders } = await server.ssrLoadModule(
    "/src/api/orderLineMetricsSupport.js"
  );
  const { fetchOrderLinesBoundedRows, fetchPaymentsBoundedRows } = bounded;

  await signInWithQaCredentials(supabase, QA_ADMIN);
  const recentFrom = recentDateYmd(HQ_DASHBOARD_RECENT_DAYS);
  const probes = [];

  probes.push(
    await timed("api.getAdminDashboardRead", () => api.getAdminDashboardRead({ tenantId: TENANT }))
  );
  probes.push(
    await timed("table.orders (dashboard bounded)", () =>
      supabase
        .from("orders")
        .select(HQ_ORDER_LIST_COLUMNS)
        .gte("order_date", recentFrom)
        .order("order_date", { ascending: false })
        .limit(HQ_DASHBOARD_ORDERS_LIMIT), { rows: (r) => r.data?.length })
  );
  probes.push(
    await timed("table.ar_credit_control", () =>
      supabase.from("ar_credit_control").select(HQ_AR_COLUMNS).limit(5000), { rows: (r) => r.data?.length })
  );
  probes.push(
    await timed("table.agent_visits", () =>
      supabase
        .from("agent_visits")
        .select("id,lab_id,agent_id,visit_date,visit_type,tenant_id")
        .gte("visit_date", recentFrom)
        .order("visit_date", { ascending: false })
        .limit(HQ_DASHBOARD_VISITS_LIMIT), { rows: (r) => r.data?.length })
  );
  probes.push(
    await timed("table.inventory", () => bounded.fetchInventoryBoundedRows(supabase), {
      rows: (r) => r.data?.length,
    })
  );
  probes.push(
    await timed("view.v_labs_credit", () => supabase.from("v_labs_credit").select("*").limit(5000), {
      rows: (r) => r.data?.length,
    })
  );
  probes.push(
    await timed("table.payments (recent)", () =>
      supabase
        .from("payments")
        .select(HQ_PAYMENT_COLUMNS)
        .gte("payment_date", recentFrom)
        .limit(5000), { rows: (r) => r.data?.length })
  );
  probes.push(
    await timed("api.getOrdersRead (with lines)", () => api.getOrdersRead({ tenantId: TENANT }), {
      rows: (r) => r.data?.orders?.length,
    })
  );
  probes.push(
    await timed("api.getOrdersRead (skipLineCounts)", () =>
      api.getOrdersRead({ skipLineCounts: true, tenantId: TENANT }), {
      rows: (r) => r.data?.orders?.length,
    })
  );
  probes.push(
    await timed("fanout.order_lines+items (100 orders)", async () => {
      const o = await supabase
        .from("orders")
        .select("order_id,id")
        .gte("order_date", recentFrom)
        .order("order_date", { ascending: false })
        .limit(100);
      const ids = (o.data || []).map((r) => r.order_id).filter(Boolean);
      return fetchOrderUnitCountsForOrders(supabase, ids, o.data || []);
    }, { rowCount: (m) => m?.size })
  );
  probes.push(
    await timed("api.getCollectionsRead", () => api.getCollectionsRead({ tenantId: TENANT }), {
      rows: (r) => r.data?.collections?.length,
    })
  );
  probes.push(
    await timed("rpc.read_lab_receivables_list_v1", () =>
      supabase.rpc("read_lab_receivables_list_v1", { p_limit: 5000, p_days_back: 90 }))
  );
  probes.push(
    await timed("api.getLabsCredit", () => api.getLabsCredit({ tenantId: TENANT }), {
      rows: (r) => r.data?.length,
    })
  );
  probes.push(
    await timed("view.v_stock_dashboard", () =>
      supabase.from("v_stock_dashboard").select("*").limit(5000), { rows: (r) => r.data?.length })
  );
  probes.push(
    await timed("rpc.get_founder_snapshot", () =>
      supabase.rpc("get_founder_snapshot", { p_tenant_id: TENANT }))
  );
  probes.push(
    await timed("rpc.read_tenant_executive_v1", () =>
      supabase.rpc("read_tenant_executive_v1", { p_tenant_id: TENANT }))
  );
  probes.push(
    await timed("efi.loadExecutiveFinancialIntelligenceData", () =>
      efiData.loadExecutiveFinancialIntelligenceData({ tenantId: TENANT, role: "executive" }))
  );
  probes.push(
    await timed("ops.loadOperationsCommandCenterData", () =>
      opsLoader.loadOperationsCommandCenterData({ tenantId: TENANT, role: "admin", id: "qa" }))
  );
  probes.push(
    await timed("fanout.order_lines bounded", () =>
      fetchOrderLinesBoundedRows(supabase, { tenantId: TENANT }), {
      rows: (r) => r.data?.length,
    })
  );
  probes.push(
    await timed("fanout.payments 366d", () =>
      fetchPaymentsBoundedRows(supabase, { daysBack: 366, tenantId: TENANT }), {
      rows: (r) => r.data?.length,
    })
  );
  probes.push(
    await timed("rpc.read_orders_list_v1", () =>
      supabase.rpc("read_orders_list_v1", { p_limit: 100, p_offset: 0, p_days_back: 90 }))
  );
  probes.push(
    await timed("table.proj_tenant_dashboard_metrics_v1", () =>
      supabase.from("proj_tenant_dashboard_metrics_v1").select("*").eq("tenant_id", TENANT).maybeSingle())
  );

  probes.sort((a, b) => b.ms - a.ms);

  if (asJson) {
    console.log(JSON.stringify({ tenantId: TENANT, probes }, null, 2));
  } else {
    console.log("\n# Sprint 5 DB Profile (QA tenant)\n");
    console.log("| Rank | Probe | ms | rows | payload KB | OK |");
    console.log("|------|-------|-----|------|------------|-----|");
    probes.forEach((p, i) => {
      const err = p.error ? ` (${String(p.error).slice(0, 50)})` : "";
      console.log(
        `| ${i + 1} | ${p.label} | ${p.ms} | ${p.rowCount ?? "—"} | ${Math.round((p.payload || 0) / 1024)} | ${p.ok ? "yes" : "NO"}${err} |`
      );
    });
  }

  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
