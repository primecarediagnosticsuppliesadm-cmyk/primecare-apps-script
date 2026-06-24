#!/usr/bin/env node
/**
 * Live QA runtime verification for HQ Global Search (not fixture-based).
 * Requires .env.local with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 *
 * Usage:
 *   node scripts/verify-hq-search-runtime.mjs
 *   QA_ADMIN_EMAIL=... QA_ADMIN_PASSWORD=... node scripts/verify-hq-search-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  buildHqSearchIndex,
  searchHqIndex,
  summarizeHqSearchIndex,
  formatHqSearchCoverageLine,
} from "../src/operations/hqGlobalSearchEngine.js";
import {
  HQ_DASHBOARD_ORDERS_LIMIT,
  HQ_DASHBOARD_RECENT_DAYS,
  HQ_LABS_CREDIT_LIMIT,
  HQ_ORDER_LIST_COLUMNS,
  HQ_PURCHASE_ORDER_COLUMNS,
  HQ_PURCHASE_ORDER_LIMIT,
  HQ_SEARCH_CATALOG_LIMIT,
  HQ_SEARCH_STOCK_LIMIT,
  HQ_V_LAB_CATALOG_COLUMNS,
  HQ_V_STOCK_DASHBOARD_COLUMNS,
  recentDateYmd,
} from "../src/api/hqReadBounds.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return {};
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

function str(v) {
  return String(v ?? "").trim();
}

const VALIDATION_QUERIES = [
  "QA Alpha",
  "Alpha",
  "QA Agent",
  "Agent One",
  "ORD",
  "ORD-1728",
  "1728",
  "QA_SKU_003",
  "QA Test Kit",
  "PO",
];

const env = loadEnvLocal();
const url = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.QA_ADMIN_EMAIL || "qa.admin@primecare.test";
const password = process.env.QA_ADMIN_PASSWORD || "1234";

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, anonKey);

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
if (authErr) {
  console.error("Auth failed:", authErr.message);
  process.exit(1);
}

const userId = auth.user.id;
const { data: profile } = await supabase
  .from("profiles")
  .select("tenant_id, role")
  .eq("user_id", userId)
  .maybeSingle();
const tenantId = str(profile?.tenant_id);

const recentFrom = recentDateYmd(HQ_DASHBOARD_RECENT_DAYS);

const [labsRes, ordersRes, catalogRes, stockRes, poRes] = await Promise.all([
  supabase
    .from("v_labs_credit")
    .select("lab_id,lab_name,tenant_id,area,owner_name,assigned_agent_id")
    .limit(HQ_LABS_CREDIT_LIMIT),
  supabase
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .gte("order_date", recentFrom)
    .order("order_date", { ascending: false })
    .limit(HQ_DASHBOARD_ORDERS_LIMIT),
  supabase.from("v_lab_catalog").select(HQ_V_LAB_CATALOG_COLUMNS).limit(HQ_SEARCH_CATALOG_LIMIT),
  supabase.from("v_stock_dashboard").select(HQ_V_STOCK_DASHBOARD_COLUMNS).limit(HQ_SEARCH_STOCK_LIMIT),
  supabase
    .from("purchase_orders")
    .select(HQ_PURCHASE_ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(HQ_PURCHASE_ORDER_LIMIT),
]);

const usersRes = await supabase
  .from("profiles")
  .select("user_id, display_name, agent_name, role, username, email, agent_id")
  .eq("tenant_id", tenantId);

function mapLab(r) {
  return {
    labId: r.lab_id,
    labName: r.lab_name,
    tenantId: r.tenant_id,
    area: r.area,
    ownerName: r.owner_name,
    assignedAgent: r.assigned_agent_id,
  };
}

function mapOrder(r) {
  return {
    orderId: str(r.order_id || r.id),
    order_id: r.order_id,
    labId: r.lab_id,
    tenantId: r.tenant_id,
    orderStatus: r.status,
  };
}

function mapProduct(r) {
  const productId = str(r.product_id || r.productId);
  return {
    productId,
    productName: str(r.product_name || r.productName) || productId,
    sku: productId,
    category: r.category,
  };
}

function mapUser(r) {
  return {
    userId: r.user_id,
    name: r.display_name || r.agent_name,
    displayName: r.display_name,
    agentName: r.agent_name,
    username: r.username,
    email: r.email,
    role: r.role,
    agentId: r.agent_id,
  };
}

const productMap = new Map();
for (const row of [...(catalogRes.data || []), ...(stockRes.data || [])]) {
  const p = mapProduct(row);
  if (p.productId) productMap.set(p.productId, p);
}

const sources = {
  labs: (labsRes.data || []).map(mapLab),
  orders: (ordersRes.data || []).map(mapOrder),
  products: [...productMap.values()],
  purchaseOrders: (poRes.data || []).map((r) => ({
    poId: str(r.po_id || r.id),
    status: r.status,
    supplierName: r.supplier_name,
  })),
  users: (usersRes.data || []).map(mapUser),
};

const index = buildHqSearchIndex(sources);
const counts = summarizeHqSearchIndex(index);

console.log("=== HQ Search Runtime Coverage (live QA) ===");
console.log(formatHqSearchCoverageLine({
  labs: { countIndexed: counts.labs },
  users: { countIndexed: counts.users },
  orders: { countIndexed: counts.orders },
  products: { countIndexed: counts.products },
  purchaseOrders: { countIndexed: counts.purchaseOrders },
}));
console.log(`Tenant: ${tenantId || "(none)"} · Role: ${profile?.role || "?"}`);
console.log(`Orders in DB: ${ordersRes.data?.length ?? 0} · Error: ${ordersRes.error?.message || "none"}`);

const order1728 = sources.orders.filter((o) => str(o.orderId).includes("1728"));
console.log(`Orders containing "1728": ${order1728.length}${order1728.length ? ` → ${order1728.map((o) => o.orderId).join(", ")}` : " (none in QA DB)"}`);

const sku003 = sources.products.find((p) => str(p.productId) === "QA_SKU_003");
console.log(`QA_SKU_003 in index sources: ${sku003 ? "yes" : "no"}`);

console.log("\n=== Validation Matrix ===");
console.log("Query | Result Count | Entity Types | Navigation Targets");
console.log("------|--------------|--------------|-------------------");

let failures = 0;
const optionalEmpty = new Set(["ORD-1728", "1728"]);

for (const query of VALIDATION_QUERIES) {
  const groups = searchHqIndex(index, query, 10);
  const flat = groups.flatMap((g) =>
    g.items.map((item) => ({ type: g.label, page: item.page, title: item.title }))
  );
  const types = [...new Set(flat.map((r) => r.type))].join(", ") || "—";
  const pages = [...new Set(flat.map((r) => r.page))].join(", ") || "—";
  const line = `${query.padEnd(14)} | ${String(flat.length).padStart(12)} | ${types.padEnd(20)} | ${pages}`;

  if (flat.length === 0 && !optionalEmpty.has(query)) {
    console.log(`FAIL ${line}`);
    failures += 1;
  } else if (flat.length === 0 && optionalEmpty.has(query)) {
    console.log(`SKIP ${line}  ← no ORD-1728 in live QA data`);
  } else {
    console.log(`PASS ${line}`);
    flat.slice(0, 3).forEach((r) => console.log(`      → ${r.type}: ${r.title} → ${r.page}`));
  }
}

if (failures > 0) {
  console.error(`\n${failures} required query(ies) returned no results.`);
  process.exit(1);
}

console.log("\nRuntime verification complete.");
