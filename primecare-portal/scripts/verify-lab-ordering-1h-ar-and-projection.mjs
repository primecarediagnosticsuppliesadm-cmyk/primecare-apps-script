#!/usr/bin/env node
/**
 * Lab Ordering 1H — AR UPDATE grant + canonical projection RPC.
 *
 * Default: static only.
 * Live QA (mutates QA only; refuses Production):
 *   node scripts/verify-lab-ordering-1h-ar-and-projection.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HQ_TENANT_ID,
  QA_LAB,
} from "./qaCredentials.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const QA_LAB_ID = "QA_LAB_001";
const OTHER_LAB_ID = "QA_LAB_002";
const FOREIGN_TENANT = "00000000-0000-0000-0000-000000000001";
const MIG_REL = "supabase/migrations/20260905150000_lab_ordering_1h_ar_update_grant_and_projection_overload_drop.sql";
const TWIN_REL = "supabase/sql/lab_ordering_1h_ar_update_grant_and_projection_overload_drop.sql";

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
  process.exitCode = 1;
}
function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function moneyEq(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

function loadEnv() {
  const candidates = [
    resolve(root, ".env.local"),
    resolve("/Users/kumarmanegalla/Documents/primecare-apps-script/primecare-portal/.env.local"),
    resolve("/private/tmp/primecare-stab-1-hotfix/primecare-portal/.env.local"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("Missing .env.local (QA)");
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  return { env, envDir: dirname(path), envPath: path };
}

function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function deniedWrite(res) {
  const msg = str(res?.error?.message).toLowerCase();
  const code = str(res?.error?.code);
  const rows = Array.isArray(res?.data) ? res.data.length : 0;
  if (res?.error) {
    return (
      code === "42501" ||
      code === "401" ||
      code === "PGRST301" ||
      /permission|denied|rls|policy|not authorized|jwt/i.test(msg)
    );
  }
  return rows === 0;
}

function ambiguousRpc(error) {
  return /could not choose the best candidate function/i.test(str(error?.message));
}

console.log("\n=== LAB ORDERING 1H AR + PROJECTION ===\n");

const mig = existsSync(resolve(root, MIG_REL)) ? readSrc(MIG_REL) : "";
const twin = existsSync(resolve(root, TWIN_REL)) ? readSrc(TWIN_REL) : "";
const apiSrc = readSrc("src/api/primecareSupabaseApi.js");
const projSrc = readSrc("src/api/projectionRefreshApi.js");

if (mig.includes("GRANT UPDATE ON TABLE public.ar_credit_control TO authenticated")) {
  pass("static.grant_update", MIG_REL);
} else {
  fail("static.grant_update", "authenticated UPDATE grant missing");
}

if (
  /GRANT UPDATE ON TABLE public\.ar_credit_control TO anon/.test(mig) ||
  /GRANT ALL ON TABLE public\.ar_credit_control TO anon/.test(mig)
) {
  fail("static.no_anon_grant", "migration must not GRANT UPDATE/ALL to anon");
} else {
  pass("static.no_anon_grant", "no anon AR UPDATE grant");
}

if (
  mig.includes("DROP FUNCTION IF EXISTS public.refresh_proj_order_row_v1(uuid, text)") &&
  mig.includes("DROP FUNCTION IF EXISTS public.refresh_proj_lab_receivable_row_v1(uuid, text)")
) {
  pass("static.drop_two_arg", "drops only (uuid, text) overloads");
} else {
  fail("static.drop_two_arg", "2-arg DROP FUNCTION missing");
}

if (
  /CREATE OR REPLACE FUNCTION public\.refresh_proj_order_row_v1/.test(mig) ||
  /CREATE OR REPLACE FUNCTION public\.refresh_proj_lab_receivable_row_v1/.test(mig)
) {
  fail("static.no_worker_rebuild", "must not recreate projection workers");
} else {
  pass("static.no_worker_rebuild", "canonical 3-arg bodies untouched");
}

if (/CREATE POLICY|DROP POLICY|ALTER POLICY/.test(mig)) {
  fail("static.no_rls_rewrite", "1H must not change AR RLS policies");
} else {
  pass("static.no_rls_rewrite", "no AR policy changes");
}

if (mig.trim() === twin.trim()) {
  pass("static.sql_twin", TWIN_REL);
} else {
  fail("static.sql_twin", "sql twin does not match versioned migration");
}

if (
  /p_cascade_metrics:\s*true/.test(projSrc) &&
  projSrc.includes('rpcRefresh("refresh_proj_order_row_v1"') &&
  projSrc.includes('rpcRefresh("refresh_proj_lab_receivable_row_v1"')
) {
  pass("static.js_cascade", "projectionRefreshApi always sends p_cascade_metrics: true");
} else {
  fail("static.js_cascade", "projectionRefreshApi missing explicit p_cascade_metrics");
}

if (
  apiSrc.includes("async function bumpArOutstandingForFulfillment") &&
  apiSrc.includes("bumpArOutstandingForFulfillment({") &&
  apiSrc.includes("patch.ar_posted = arDoneFlag")
) {
  pass("static.fulfill_ar_path", "updateOrderStatusWrite still posts AR via bumpArOutstandingForFulfillment");
} else {
  fail("static.fulfill_ar_path", "fulfillment AR path missing");
}

if (!APPLY) {
  console.log("\nStatic checks complete. Rerun with --apply for live QA probes (QA only).\n");
  process.exit(process.exitCode || 0);
}

const { env, envDir } = loadEnv();
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
const adminSb = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
if (!adminSb) {
  fail("live.service_role", "SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

async function signIn(client, creds, label, { required = true } = {}) {
  const { error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) {
    if (required) fail(`live.auth.${label}`, error.message);
    else warn(`live.auth.${label}`, error.message);
  } else {
    pass(`live.auth.${label}`, creds.email);
  }
  return !error;
}

async function readAr(labId) {
  const { data, error } = await adminSb
    .from("ar_credit_control")
    .select("lab_id,outstanding,total_delivered,updated_at,tenant_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", labId)
    .maybeSingle();
  return { data, error };
}

async function roleUpdate(client, labId, tenantId = QA_HQ_TENANT_ID) {
  return client
    .from("ar_credit_control")
    .update({ updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("lab_id", labId)
    .select("lab_id");
}

async function readStock(productId) {
  const { data } = await adminSb
    .from("inventory")
    .select("current_stock")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("product_id", productId)
    .maybeSingle();
  return Number(data?.current_stock ?? NaN);
}

async function catalogProduct() {
  const { data, error } = await adminSb
    .from("products")
    .select("product_id,product_name,selling_price,active")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("active", true)
    .gt("selling_price", 0)
    .limit(25);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const inv = await adminSb
      .from("inventory")
      .select("product_id,current_stock")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("product_id", row.product_id)
      .gt("current_stock", 1)
      .maybeSingle();
    if (inv.data?.product_id) {
      return { ...row, current_stock: Number(inv.data.current_stock) };
    }
  }
  return null;
}

const labClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const agentClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adminClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const execClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (!(await signIn(labClient, QA_LAB, "lab"))) process.exit(1);
const agentOk = await signIn(agentClient, QA_AGENT, "agent", { required: false });
if (!(await signIn(adminClient, QA_ADMIN, "admin"))) process.exit(1);
if (!(await signIn(execClient, QA_EXECUTIVE, "executive"))) process.exit(1);

const arBeforeProbe = await readAr(QA_LAB_ID);
if (!arBeforeProbe.data) {
  fail("live.ar_row", arBeforeProbe.error?.message || `${QA_LAB_ID} AR row missing`);
  process.exit(1);
}

const anonUpd = await anon.from("ar_credit_control").update({ updated_at: new Date().toISOString() }).eq("lab_id", QA_LAB_ID).select("lab_id");
if (deniedWrite(anonUpd)) pass("live.anon_ar_update_denied", anonUpd.error?.message || "0 rows / no session");
else fail("live.anon_ar_update_denied", "anon updated AR");

const labOwn = await roleUpdate(labClient, QA_LAB_ID);
if (deniedWrite(labOwn)) pass("live.lab_own_ar_update_denied", labOwn.error?.message || "RLS 0 rows");
else fail("live.lab_own_ar_update_denied", "lab updated own AR (HQ path leak)");

const labOther = await roleUpdate(labClient, OTHER_LAB_ID);
if (deniedWrite(labOther)) pass("live.lab_other_ar_update_denied", labOther.error?.message || "RLS 0 rows");
else fail("live.lab_other_ar_update_denied", "lab updated another lab AR");

if (agentOk) {
  const agentForeignTenant = await roleUpdate(agentClient, QA_LAB_ID, FOREIGN_TENANT);
  if (deniedWrite(agentForeignTenant)) {
    pass("live.agent_foreign_tenant_ar_denied", agentForeignTenant.error?.message || "RLS 0 rows");
  } else {
    fail("live.agent_foreign_tenant_ar_denied", "agent updated foreign-tenant AR");
  }
} else {
  warn("live.agent_foreign_tenant_ar_denied", "skipped — QA agent login unavailable");
}

const adminForeign = await roleUpdate(adminClient, QA_LAB_ID, FOREIGN_TENANT);
if (deniedWrite(adminForeign)) pass("live.admin_foreign_tenant_ar_denied", adminForeign.error?.message || "RLS 0 rows");
else fail("live.admin_foreign_tenant_ar_denied", "admin updated foreign-tenant AR");

const adminTouch = await roleUpdate(adminClient, QA_LAB_ID);
if (!deniedWrite(adminTouch) && (adminTouch.data || []).some((r) => r.lab_id === QA_LAB_ID)) {
  pass("live.admin_ar_update_allowed", "admin UPDATE passed existing RLS");
} else {
  fail("live.admin_ar_update_allowed", adminTouch.error?.message || "admin AR UPDATE blocked after GRANT");
}

const execTouch = await roleUpdate(execClient, QA_LAB_ID);
if (!deniedWrite(execTouch) && (execTouch.data || []).some((r) => r.lab_id === QA_LAB_ID)) {
  pass("live.executive_ar_update_allowed", "executive UPDATE passed existing RLS");
} else {
  fail("live.executive_ar_update_allowed", execTouch.error?.message || "executive AR UPDATE blocked after GRANT");
}

const arAfterProbe = await readAr(QA_LAB_ID);
if (
  moneyEq(arAfterProbe.data?.outstanding, arBeforeProbe.data.outstanding) &&
  moneyEq(arAfterProbe.data?.total_delivered, arBeforeProbe.data.total_delivered)
) {
  pass("live.ar_probe_no_amount_change", "privilege probes did not change outstanding/total_delivered");
} else {
  fail("live.ar_probe_no_amount_change", "privilege probes mutated AR amounts");
}

const orderRpc = await adminClient.rpc("refresh_proj_order_row_v1", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_order_id: "ORD-1H-SIGNATURE-PROBE",
  p_cascade_metrics: true,
});
if (ambiguousRpc(orderRpc.error)) {
  fail("live.proj_order_rpc", orderRpc.error.message);
} else if (orderRpc.error && /could not find.*function/i.test(orderRpc.error.message || "")) {
  fail("live.proj_order_rpc", orderRpc.error.message);
} else {
  pass("live.proj_order_rpc", orderRpc.error ? `resolved (${orderRpc.error.message})` : "explicit p_cascade_metrics ok");
}

const recvRpc = await adminClient.rpc("refresh_proj_lab_receivable_row_v1", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_lab_id: QA_LAB_ID,
  p_cascade_metrics: true,
});
if (ambiguousRpc(recvRpc.error)) {
  fail("live.proj_receivable_rpc", recvRpc.error.message);
} else if (recvRpc.error && /could not find.*function/i.test(recvRpc.error.message || "")) {
  fail("live.proj_receivable_rpc", recvRpc.error.message);
} else {
  pass("live.proj_receivable_rpc", recvRpc.error ? `resolved (${recvRpc.error.message})` : "explicit p_cascade_metrics ok");
}

const twoArgOrder = await adminClient.rpc("refresh_proj_order_row_v1", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_order_id: "ORD-1H-SIGNATURE-PROBE",
});
if (ambiguousRpc(twoArgOrder.error)) {
  fail("live.proj_order_two_named_ok", twoArgOrder.error.message);
} else {
  pass("live.proj_order_two_named_ok", "2 named args uniquely resolve after DROP");
}

let viteServer = null;
try {
  const product = await catalogProduct();
  if (!product) {
    fail("live.fixture.product", "no in-stock product with selling_price > 0");
    process.exit(1);
  }
  pass(
    "live.fixture.product",
    `${product.product_id} selling_price=${product.selling_price} stock=${product.current_stock}`
  );

  await adminSb
    .from("labs")
    .update({ ordering_mode: "self_service", status: "ACTIVE" })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", QA_LAB_ID);

  const orderId = `ORD-1H-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const placed = await labClient.rpc("create_lab_order", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: QA_LAB_ID,
    p_order_id: orderId,
    p_items: [{ product_id: product.product_id, quantity: 1 }],
    p_client_request_id: `CRQ-1H-${orderId}`,
    p_status: "Placed",
    p_created_by: QA_LAB.email,
  });
  if (placed.error) {
    fail("live.place", placed.error.message);
    process.exit(1);
  }
  pass("live.place", orderId);

  const { data: placedOrder } = await adminSb
    .from("orders")
    .select("order_id,status,total_amount,delivery_charge_amount,merchandise_subtotal,inventory_updated,ar_posted,invoice_id")
    .eq("order_id", orderId)
    .maybeSingle();
  const merchandise = Number(placedOrder?.total_amount ?? 0);
  if (merchandise <= 0) {
    fail("live.place_amount", "placed order total_amount was not > 0");
    process.exit(1);
  }
  if (
    moneyEq(placedOrder.total_amount, product.selling_price) ||
    moneyEq(placedOrder.merchandise_subtotal, product.selling_price)
  ) {
    pass("live.server_price", `merchandise=${merchandise} catalog=${product.selling_price}`);
  } else {
    fail(
      "live.server_price",
      `total_amount=${placedOrder.total_amount} merchandise_subtotal=${placedOrder.merchandise_subtotal} catalog=${product.selling_price}`
    );
  }
  if (placedOrder.inventory_updated === true) {
    fail("live.place_no_inventory", "PLACE deducted inventory");
  } else {
    pass("live.place_no_inventory", "PLACE left inventory_updated false");
  }

  const stockBefore = await readStock(product.product_id);
  const arBefore = await readAr(QA_LAB_ID);
  const { count: ledgerBefore } = await adminSb
    .from("inventory_ledger")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("movement_type", "ORDER_OUT");

  viteServer = await createServer({
    configFile: resolve(root, "vite.config.js"),
    envDir,
    server: { middlewareMode: true },
  });
  const { supabase } = await viteServer.ssrLoadModule("/src/api/supabaseClient.js");
  const { data: adminSession } = await adminClient.auth.getSession();
  if (supabase && adminSession?.session) {
    await supabase.auth.setSession({
      access_token: adminSession.session.access_token,
      refresh_token: adminSession.session.refresh_token,
    });
  }
  const primeApi = await viteServer.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  const fulfillRes = await primeApi.updateOrderStatusWrite(orderId, "Fulfilled", {
    actorId: QA_ADMIN.email,
    note: "lab-ordering-1h QA certify",
    orderStatus: placedOrder.status,
  });
  if (!fulfillRes?.success) {
    fail("live.fulfill", fulfillRes?.error || "updateOrderStatusWrite failed");
    process.exit(1);
  }
  pass("live.fulfill", "updateOrderStatusWrite Placed -> Fulfilled");

  const { data: fulfilled } = await adminSb
    .from("orders")
    .select("status,total_amount,inventory_updated,ar_posted,invoice_id,lab_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (fulfilled?.status !== "Fulfilled") fail("live.status", `status=${fulfilled?.status}`);
  else pass("live.status", "Fulfilled");

  if (fulfilled?.inventory_updated !== true) fail("live.inventory_updated", String(fulfilled?.inventory_updated));
  else pass("live.inventory_updated", "true");

  if (fulfilled?.ar_posted !== true) fail("live.ar_posted", String(fulfilled?.ar_posted));
  else pass("live.ar_posted", "true");

  const stockAfter = await readStock(product.product_id);
  if (stockAfter === stockBefore - 1) pass("live.stock_once", `${stockBefore} -> ${stockAfter}`);
  else fail("live.stock_once", `${stockBefore} -> ${stockAfter}`);

  const { data: ledgerRows } = await adminSb
    .from("inventory_ledger")
    .select("id,quantity,product_id")
    .eq("order_id", orderId)
    .eq("movement_type", "ORDER_OUT");
  if ((ledgerRows || []).length === 1 && Number(ledgerRows[0].quantity) === 1) {
    pass("live.order_out_once", `1 ORDER_OUT qty=1 (before=${ledgerBefore || 0})`);
  } else {
    fail("live.order_out_once", `count=${(ledgerRows || []).length}`);
  }

  const arAfter = await readAr(QA_LAB_ID);
  const outDelta = Number(arAfter.data?.outstanding ?? 0) - Number(arBefore.data?.outstanding ?? 0);
  const delDelta = Number(arAfter.data?.total_delivered ?? 0) - Number(arBefore.data?.total_delivered ?? 0);
  if (moneyEq(outDelta, merchandise)) pass("live.ar_outstanding", `+${outDelta} merchandise=${merchandise}`);
  else fail("live.ar_outstanding", `delta=${outDelta} merchandise=${merchandise} delivery=${placedOrder.delivery_charge_amount}`);
  if (moneyEq(delDelta, merchandise)) pass("live.ar_total_delivered", `+${delDelta}`);
  else fail("live.ar_total_delivered", `delta=${delDelta} merchandise=${merchandise}`);

  if (fulfilled?.invoice_id) {
    const { data: inv } = await adminSb
      .from("invoices")
      .select("id,invoice_number,status,total_amount,order_id")
      .eq("id", fulfilled.invoice_id)
      .maybeSingle();
    if (inv?.id && inv.order_id === orderId) {
      pass("live.invoice", `${inv.invoice_number} status=${inv.status} total=${inv.total_amount}`);
    } else {
      fail("live.invoice", "invoice row missing or order_id mismatch");
    }
  } else {
    fail("live.invoice", "orders.invoice_id empty after fulfill");
  }

  const { data: ships } = await adminSb
    .from("order_shipments")
    .select("shipment_id,order_id")
    .eq("order_id", orderId);
  if ((ships || []).length >= 1) pass("live.shipment", ships[0].shipment_id);
  else fail("live.shipment", "no order_shipments row");

  const refreshAfter = await adminClient.rpc("refresh_proj_order_row_v1", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_order_id: orderId,
    p_cascade_metrics: true,
  });
  const refreshRecv = await adminClient.rpc("refresh_proj_lab_receivable_row_v1", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: QA_LAB_ID,
    p_cascade_metrics: true,
  });
  if (ambiguousRpc(refreshAfter.error) || ambiguousRpc(refreshRecv.error)) {
    fail("live.proj_after_fulfill", refreshAfter.error?.message || refreshRecv.error?.message);
  } else {
    pass("live.proj_after_fulfill", "canonical refresh after fulfill had no overload warning");
  }

  const again = await primeApi.updateOrderStatusWrite(orderId, "Fulfilled", {
    actorId: QA_ADMIN.email,
    note: "lab-ordering-1h repeat",
    orderStatus: "Fulfilled",
  });
  if (!again?.success) {
    pass("live.repeat_fulfill_guarded", again?.error || "repeat rejected");
  } else {
    pass("live.repeat_fulfill_idempotent", "second Fulfilled call returned success");
  }
  const stockRepeat = await readStock(product.product_id);
  const arRepeat = await readAr(QA_LAB_ID);
  const { data: ledgerRepeat } = await adminSb
    .from("inventory_ledger")
    .select("id")
    .eq("order_id", orderId)
    .eq("movement_type", "ORDER_OUT");
  if (stockRepeat === stockAfter) pass("live.repeat_stock", "no second deduction");
  else fail("live.repeat_stock", `${stockAfter} -> ${stockRepeat}`);
  if ((ledgerRepeat || []).length === 1) pass("live.repeat_ledger", "still one ORDER_OUT");
  else fail("live.repeat_ledger", `count=${(ledgerRepeat || []).length}`);
  if (
    moneyEq(arRepeat.data?.outstanding, arAfter.data?.outstanding) &&
    moneyEq(arRepeat.data?.total_delivered, arAfter.data?.total_delivered)
  ) {
    pass("live.repeat_ar", "no second AR increment");
  } else {
    fail("live.repeat_ar", "AR changed on repeat fulfill/refresh");
  }
} catch (err) {
  fail("live.exception", err?.message || String(err));
} finally {
  if (viteServer) await viteServer.close();
}

console.log(failures ? `\n1H FAIL count=${failures}\n` : "\n1H QA apply complete.\n");
process.exit(process.exitCode || 0);
