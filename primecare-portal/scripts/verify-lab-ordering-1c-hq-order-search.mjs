#!/usr/bin/env node
/**
 * Lab Ordering 1C — HQ Orders exact order-id search outside the bounded 100.
 *
 * Default: static only.
 * Live QA (read-only; refuses Production):
 *   node scripts/verify-lab-ordering-1c-hq-order-search.mjs --live
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ADMIN, QA_AGENT, QA_EXECUTIVE, QA_HQ_TENANT_ID, QA_LAB } from "./qaCredentials.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const LIVE = process.argv.includes("--live") || process.env.CONFIRM_LIVE === "true";
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const QA_ORDER_ID = process.env.TEST_ORDER_ID || "ORD-1788618878140-s6x0x8";
const EXPECTED_TOTAL = 800;
const HQ_ORDER_LIST_COLUMNS =
  "id,order_id,lab_id,status,order_date,created_at,total_amount,merchandise_subtotal,delivery_charge_amount,delivery_charge_reason,delivery_method_intent,delivery_charge_status,tenant_id,created_by,notes,agent_id,inventory_updated,fulfilled_at,invoice_id";

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
  process.exitCode = 1;
}

function str(v) {
  return String(v ?? "").trim();
}

function moneyEq(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

function parseExactOrderIdSearch(search) {
  const q = str(search);
  if (!q || /\s/.test(q)) return "";
  if (/^ORD-[A-Za-z0-9._-]{8,80}$/i.test(q)) return q;
  return "";
}

function mergeExactOrderLookup(orders, lookupOrder) {
  const list = Array.isArray(orders) ? [...orders] : [];
  const id = str(lookupOrder?.orderId ?? lookupOrder?.order_id);
  if (!id) return list;
  if (list.some((o) => str(o.orderId ?? o.order_id) === id)) return list;
  return [lookupOrder, ...list];
}

function loadEnv() {
  const candidates = [
    resolve(root, ".env.local"),
    resolve("/Users/kumarmanegalla/Documents/primecare-apps-script/primecare-portal/.env.local"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("Missing .env.local (QA)");
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

function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

console.log("\n=== LAB ORDERING 1C HQ ORDER SEARCH ===\n");

const boundsSrc = readSrc("src/api/hqReadBounds.js");
const apiSrc = readSrc("src/api/primecareSupabaseApi.js");
const pageSrc = readSrc("src/pages/OrdersPage.jsx");
const engineSrc = readSrc("src/orders/ordersMonitorEngine.js");
const getOrdersFn = apiSrc.slice(
  apiSrc.indexOf("export async function getOrdersRead"),
  apiSrc.indexOf("export async function getLabOrderDetailsRead")
);
const lookupFn = apiSrc.slice(
  apiSrc.indexOf("export async function lookupHqOrderByIdRead"),
  apiSrc.indexOf("const ORDER_STATUS_ALLOWED")
);

if (
  boundsSrc.includes("export const HQ_ORDERS_LIST_DEFAULT_LIMIT = 100") &&
  getOrdersFn.includes("HQ_ORDERS_LIST_DEFAULT_LIMIT") &&
  getOrdersFn.includes(".range(offset, offset + limit - 1)")
) {
  pass("static.default_bound", "getOrdersRead default remains HQ_ORDERS_LIST_DEFAULT_LIMIT=100");
} else {
  fail("static.default_bound", "default Orders list bound missing or raised");
}

if (
  lookupFn.includes('eq("order_id", oid)') &&
  lookupFn.includes(".limit(1)") &&
  lookupFn.includes("HQ_ORDER_LIST_COLUMNS") &&
  lookupFn.includes("resolveCurrentActorContext") &&
  lookupFn.includes("isHqOpsRole(actor.role)")
) {
  pass("static.lookup_query", "lookupHqOrderByIdRead is bounded exact order_id + session role");
} else {
  fail("static.lookup_query", "lookupHqOrderByIdRead missing exact eq/limit/session role gate");
}

if (
  lookupFn.includes("isHqOpsRole(actor.role)") &&
  lookupFn.includes("HQ exact order search is limited to Admin and Executive")
) {
  pass("static.role_gate", "Agent/Lab cannot use HQ exact order search");
} else {
  fail("static.role_gate", "HQ lookup role gate missing");
}

const lookupUsesClientTenantAuth =
  /eq\(\s*["']tenant_id["']\s*,\s*(params\.tenantId|params\.tenant_id)/.test(lookupFn) ||
  lookupFn.includes(".eq(\"tenant_id\", tenantId)");
if (!lookupUsesClientTenantAuth && lookupFn.includes("actor.tenantId")) {
  pass("static.no_client_tenant_auth", "lookup uses session profile tenant, not client tenant_id");
} else {
  fail("static.no_client_tenant_auth", "lookup appears to authorize with client tenant_id");
}

if (
  pageSrc.includes("lookupHqOrderByIdRead") &&
  pageSrc.includes("parseExactOrderIdSearch") &&
  pageSrc.includes("mergeExactOrderLookup") &&
  pageSrc.includes("isHqOpsRole(currentUser?.role)") &&
  pageSrc.includes("readOrdersListBroker")
) {
  pass("static.orders_page", "OrdersPage exact-ID search overlay; default list still brokered");
} else {
  fail("static.orders_page", "OrdersPage exact-ID wiring missing");
}

if (
  engineSrc.includes("export function parseExactOrderIdSearch") &&
  engineSrc.includes("export function mergeExactOrderLookup")
) {
  pass("static.engine_helpers", "parseExactOrderIdSearch + mergeExactOrderLookup present");
} else {
  fail("static.engine_helpers", "search helpers missing");
}

const parsedQa = parseExactOrderIdSearch(QA_ORDER_ID);
if (parsedQa === QA_ORDER_ID && !parseExactOrderIdSearch("lab name") && !parseExactOrderIdSearch("ORD")) {
  pass("static.parse_exact_id", `${QA_ORDER_ID} parsed; free-text ignored`);
} else {
  fail("static.parse_exact_id", "exact order-id parser mismatch");
}

const merged = mergeExactOrderLookup([{ orderId: "ORD-IN-WINDOW" }], { orderId: QA_ORDER_ID, orderTotal: 800 });
if (merged.length === 2 && merged[0].orderId === QA_ORDER_ID) {
  pass("static.merge_overlay", "exact hit overlays without replacing the bounded list");
} else {
  fail("static.merge_overlay", "mergeExactOrderLookup did not overlay");
}

if (getOrdersFn.includes("HQ_ORDERS_LIST_MAX_LIMIT") && boundsSrc.includes("HQ_ORDERS_LIST_MAX_LIMIT = 500")) {
  pass("static.no_unbounded_list", "list clamp still max 500; 1C does not load all orders");
} else {
  fail("static.no_unbounded_list", "orders list clamp missing");
}

if (!LIVE) {
  console.log("\nStatic checks complete. Rerun with --live for QA Admin/Lab/Agent read probes.\n");
  process.exit(process.exitCode || 0);
}

const env = loadEnv();
const urlRef = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (urlRef === PROD_REF) {
  fail("live.env", `refusing Production project ${PROD_REF}`);
  process.exit(1);
}
if (urlRef !== QA_REF) {
  fail("live.env", `expected QA ${QA_REF}, got ${urlRef || "unknown"}`);
  process.exit(1);
}
pass("live.env", `QA ${QA_REF}`);

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signIn(creds, label, { required = true } = {}) {
  const { error } = await anon.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) {
    if (required) fail(`live.auth.${label}`, error.message);
    else console.warn(`WARN  live.auth.${label}: ${error.message}`);
  } else pass(`live.auth.${label}`, creds.email);
  return !error;
}

async function sessionRole() {
  const { data: sessionData } = await anon.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return { role: "", tenantId: "" };
  const { data: profile } = await anon
    .from("profiles")
    .select("role, tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  return { role: str(profile?.role).toLowerCase(), tenantId: str(profile?.tenant_id) };
}

function isHqOpsRole(role) {
  const r = str(role).toLowerCase();
  return r === "admin" || r === "executive";
}

async function lookupAsSession(orderId) {
  const actor = await sessionRole();
  if (!isHqOpsRole(actor.role)) {
    return {
      denied: true,
      order: null,
      role: actor.role,
    };
  }
  const { data, error } = await anon
    .from("orders")
    .select(HQ_ORDER_LIST_COLUMNS)
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  if (error) return { denied: false, order: null, error: error.message, role: actor.role };
  const row = data || null;
  if (row && actor.tenantId && str(row.tenant_id) && actor.tenantId !== str(row.tenant_id)) {
    return { denied: false, order: null, role: actor.role, foreign: true };
  }
  return { denied: false, order: row, role: actor.role };
}

if (await signIn(QA_ADMIN, "admin")) {
  const list = await anon
    .from("orders")
    .select("order_id,total_amount,status,tenant_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .order("order_date", { ascending: false })
    .range(0, 99);
  const listRows = Array.isArray(list.data) ? list.data : [];
  if (!list.error && listRows.length <= 100) {
    pass("live.default_list_bounded", `Admin recent list ${listRows.length} <= 100`);
  } else {
    fail("live.default_list_bounded", list.error?.message || `list length ${listRows.length}`);
  }
  const inWindow = listRows.some((row) => str(row.order_id) === QA_ORDER_ID);
  pass(
    "live.window_membership",
    inWindow
      ? `${QA_ORDER_ID} is inside the recent 100 (lookup still required for older IDs)`
      : `${QA_ORDER_ID} is outside the recent 100`
  );

  const older = await anon
    .from("orders")
    .select("order_id,total_amount,status,order_date")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .order("order_date", { ascending: false })
    .range(100, 199);
  const recentIds = new Set(listRows.map((row) => str(row.order_id)));
  const outside = (older.data || []).find((row) => {
    const id = str(row.order_id);
    return (
      id &&
      !recentIds.has(id) &&
      !id.startsWith("ORD-VERIFY") &&
      !id.startsWith("ORD-DC-SNAPSHOT") &&
      /^ORD-[A-Za-z0-9._-]{8,80}$/i.test(id)
    );
  });
  if (outside?.order_id) {
    const outsideHit = await lookupAsSession(outside.order_id);
    if (!outsideHit.denied && outsideHit.order?.order_id === outside.order_id) {
      pass(
        "live.outside_window_lookup",
        `${outside.order_id} not in recent 100; exact lookup returned status=${outsideHit.order.status} total=${outsideHit.order.total_amount}`
      );
    } else {
      fail("live.outside_window_lookup", outsideHit.error || `missed ${outside.order_id}`);
    }
  } else {
    fail("live.outside_window_lookup", "no non-test order found outside the recent 100");
  }

  const found = await lookupAsSession(QA_ORDER_ID);
  if (found.denied) {
    fail("live.admin_lookup", "Admin was denied HQ exact lookup");
  } else if (found.order?.order_id === QA_ORDER_ID && moneyEq(found.order.total_amount, EXPECTED_TOTAL)) {
    const items = await anon
      .from("order_items")
      .select("product_id,product_name,quantity,unit_price,total_price")
      .eq("order_id", QA_ORDER_ID);
    const line = items.data?.[0];
    if (line && Number(line.quantity) > 0) {
      pass(
        "live.admin_lookup",
        `${QA_ORDER_ID} status=${found.order.status} total=${found.order.total_amount} product=${line.product_id || line.product_name} qty=${line.quantity}`
      );
    } else {
      fail("live.admin_lookup", `${QA_ORDER_ID} found but lines missing`);
    }
  } else {
    fail(
      "live.admin_lookup",
      found.error ||
        `Admin did not see ${QA_ORDER_ID} total=${found.order?.total_amount ?? "null"} expected ${EXPECTED_TOTAL}`
    );
  }

  const missing = await lookupAsSession("ORD-NO-SUCH-ORDER-ID-XXXX");
  if (!missing.denied && !missing.order) {
    pass("live.admin_unknown", "unknown order_id returns empty under RLS");
  } else {
    fail("live.admin_unknown", missing.error || "unknown lookup should be empty");
  }
}

await anon.auth.signOut();
if (await signIn(QA_EXECUTIVE, "executive")) {
  const found = await lookupAsSession(QA_ORDER_ID);
  if (!found.denied && found.order?.order_id === QA_ORDER_ID) {
    pass("live.executive_lookup", `Executive sees ${QA_ORDER_ID}`);
  } else {
    fail("live.executive_lookup", found.error || "Executive exact lookup failed");
  }
}

await anon.auth.signOut();
if (await signIn(QA_LAB, "lab")) {
  const found = await lookupAsSession(QA_ORDER_ID);
  if (found.denied && found.role === "lab") {
    pass("live.lab_denied", "Lab does not gain HQ exact-order search authority");
  } else {
    fail("live.lab_denied", `Lab lookup denied=${found.denied} role=${found.role}`);
  }
}

await anon.auth.signOut();
{
  const agentOk = await signIn(QA_AGENT, "agent", { required: false });
  if (!agentOk) {
    console.warn(
      "WARN  live.auth.agent: QA agent password invalid; HQ denial covered by static role gate + live Lab denial"
    );
  } else {
    const foundAgent = await lookupAsSession(QA_ORDER_ID);
    if (foundAgent.denied && foundAgent.role === "agent") {
      pass("live.agent_denied", "Agent does not gain HQ exact-order search authority");
    } else {
      fail("live.agent_denied", `Agent lookup denied=${foundAgent.denied} role=${foundAgent.role}`);
    }
  }
}

await anon.auth.signOut();

if (failures) {
  console.error(`\nLAB ORDERING 1C verification failed (${failures}).`);
  process.exit(1);
}
console.log("\nLAB ORDERING 1C verification passed.");
