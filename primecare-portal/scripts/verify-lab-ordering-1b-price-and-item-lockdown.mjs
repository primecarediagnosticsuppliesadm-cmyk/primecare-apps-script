#!/usr/bin/env node
/**
 * Lab Ordering 1B — catalog price = products.selling_price; Lab cannot write order_items.
 *
 * Default: static only.
 * Live QA:
 *   node scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ADMIN, QA_HQ_TENANT_ID, QA_LAB } from "./qaCredentials.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const QA_LAB_ID = "QA_LAB_001";
const OTHER_LAB_ID = "QA_LAB_002";
const SKU = "QA_SKU_002";
const MIGRATION_REL = "supabase/migrations/20260905130000_lab_ordering_1b_catalog_price_and_item_lockdown.sql";
const SQL_TWIN_REL = "supabase/sql/lab_ordering_1b_catalog_price_and_item_lockdown.sql";

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
function rlsDenied(error) {
  const msg = str(error?.message).toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("violates row-level")
  );
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

console.log("\n=== LAB ORDERING 1B PRICE + ITEM LOCKDOWN ===\n");

const mig = existsSync(resolve(root, MIGRATION_REL)) ? readSrc(MIGRATION_REL) : "";
const twin = existsSync(resolve(root, SQL_TWIN_REL)) ? readSrc(SQL_TWIN_REL) : "";
const apiSrc = readSrc("src/api/primecareSupabaseApi.js");
const boundsSrc = readSrc("src/api/hqReadBounds.js");
const boundedSrc = readSrc("src/api/hqBoundedReads.js");

if (mig.includes("p.tenant_id = i.tenant_id") && mig.includes("p.selling_price")) {
  pass("static.view_tenant_join", MIGRATION_REL);
} else {
  fail("static.view_tenant_join", "1B migration missing tenant-scoped products.selling_price join");
}
if (twin.includes("p.tenant_id = i.tenant_id")) pass("static.sql_twin", SQL_TWIN_REL);
else fail("static.sql_twin", "manual SQL twin missing tenant join");

if (
  mig.includes("order_items_insert_by_role") &&
  !mig.includes("current_user_role() = 'lab'") &&
  mig.includes("order_items_delete_by_role")
) {
  pass("static.item_lockdown", "Lab branch removed from order_items writes; delete policy present");
} else {
  fail("static.item_lockdown", "order_items Lab write lockdown incomplete");
}

if (
  boundsSrc.includes("HQ_LAB_CATALOG_LIST_COLUMNS") &&
  boundsSrc.includes("unit_selling_price") &&
  boundedSrc.includes("HQ_LAB_CATALOG_LIST_COLUMNS")
) {
  pass("static.catalog_select", "Lab catalog read selects v_lab_catalog.unit_selling_price");
} else {
  fail("static.catalog_select", "catalog column list missing unit_selling_price");
}

const mapper = apiSrc.match(/export function mapLabCatalogRow\([\s\S]*?^}/m)?.[0] || "";
if (
  mapper.includes("row.unit_selling_price") &&
  mapper.includes("row.selling_price") &&
  !mapper.includes("row.unit_price")
) {
  pass("static.mapper", "mapLabCatalogRow uses catalog/product selling price only");
} else {
  fail("static.mapper", "mapLabCatalogRow still falls back to unit_price");
}

if (apiSrc.includes("const tenantScoped = preferredTenantId")) {
  pass("static.tenant_filter", "getLabCatalogRead filters to preferred tenant");
} else {
  fail("static.tenant_filter", "catalog tenant filter missing");
}

if (!APPLY) {
  console.log("\nStatic checks complete. Rerun with --apply for live QA probes.\n");
  process.exit(process.exitCode || 0);
}

const env = loadEnv();
const urlRef = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (urlRef === PROD_REF) {
  fail("live.env", `refusing Production ${PROD_REF}`);
  process.exit(1);
}
if (urlRef !== QA_REF) {
  fail("live.env", `expected QA ${QA_REF}, got ${urlRef || "unknown"}`);
  process.exit(1);
}
pass("live.env", `QA ${QA_REF}`);

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const adminSb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signIn(creds, label) {
  const { error } = await anon.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) fail(`live.auth.${label}`, error.message);
  else pass(`live.auth.${label}`, creds.email);
  return !error;
}

const product = await adminSb
  .from("products")
  .select("product_id,selling_price,product_name")
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("product_id", SKU)
  .maybeSingle();
if (!product.data) {
  fail("live.fixture.product", product.error?.message || `${SKU} missing`);
  process.exit(1);
}
const X = Number(product.data.selling_price);
pass("live.authority", `${SKU} products.selling_price=${X}`);

const catalogRows = await adminSb
  .from("v_lab_catalog")
  .select("tenant_id,product_id,unit_selling_price")
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("product_id", SKU);
const hqRows = catalogRows.data || [];
if (hqRows.length === 1 && moneyEq(hqRows[0].unit_selling_price, X)) {
  pass("live.view_price", `v_lab_catalog HQ ${SKU} unit_selling_price=${hqRows[0].unit_selling_price} (1 row)`);
} else {
  fail(
    "live.view_price",
    `expected 1 HQ row at ${X}, got ${hqRows.length} rows ${JSON.stringify(hqRows)}`
  );
}

if (!(await signIn(QA_LAB, "lab"))) process.exit(1);

const labCatalog = await anon
  .from("v_lab_catalog")
  .select("tenant_id,product_id,unit_selling_price,product_name")
  .eq("product_id", SKU);
const labPrices = [...new Set((labCatalog.data || []).map((r) => Number(r.unit_selling_price)))];
if (labPrices.length === 1 && moneyEq(labPrices[0], X)) {
  pass("live.lab_catalog_display", `Lab catalog ${SKU} = ${labPrices[0]}`);
} else {
  fail("live.lab_catalog_display", `Lab catalog prices=${JSON.stringify(labPrices)} expected [${X}]`);
}

const qty = 1;
const tamper = X + 111.11;
const orderId = `ORD-1B-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const created = await anon.rpc("create_lab_order", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_lab_id: QA_LAB_ID,
  p_order_id: orderId,
  p_items: [{ product_id: SKU, quantity: qty, unit_price: tamper }],
  p_client_request_id: `CRQ-${orderId}`,
  p_status: "Placed",
  p_created_by: QA_LAB.email,
});
if (created.error) {
  fail("live.create_lab_order", created.error.message);
} else {
  const items = await adminSb
    .from("order_items")
    .select("order_item_id,product_id,quantity,unit_price,total_price")
    .eq("order_id", orderId);
  const line = items.data?.[0];
  const order = await adminSb.from("orders").select("total_amount,lab_id").eq("order_id", orderId).maybeSingle();
  if (line && moneyEq(line.unit_price, X) && moneyEq(line.total_price, X * qty) && moneyEq(order.data?.total_amount, X * qty)) {
    pass(
      "live.price_consistency",
      `${orderId} stored unit_price=${line.unit_price} total=${order.data.total_amount} (client sent ${tamper})`
    );
  } else {
    fail(
      "live.price_consistency",
      `unit=${line?.unit_price} total=${order.data?.total_amount} expected unit=${X}`
    );
  }

  const ownItemId = line?.order_item_id;
  const directInsert = await anon.from("order_items").insert({
    order_item_id: `OIN-HACK-${Date.now()}`,
    order_id: orderId,
    tenant_id: QA_HQ_TENANT_ID,
    product_id: SKU,
    product_name: "HACK",
    quantity: 1,
    unit_price: 1,
    total_price: 1,
    created_by: QA_LAB.email,
  });
  if (rlsDenied(directInsert.error) || directInsert.error) {
    pass("live.direct_insert", directInsert.error.message);
  } else {
    fail("live.direct_insert", "Lab direct INSERT succeeded");
  }

  const directUpdate = await anon
    .from("order_items")
    .update({ unit_price: 1, total_price: 1 })
    .eq("order_id", orderId)
    .eq("order_item_id", ownItemId)
    .select("order_item_id,unit_price");
  const afterUpdate = await adminSb
    .from("order_items")
    .select("unit_price")
    .eq("order_id", orderId)
    .eq("order_item_id", ownItemId)
    .maybeSingle();
  const updateBlocked = rlsDenied(directUpdate.error) || !(directUpdate.data || []).length;
  if (updateBlocked && moneyEq(afterUpdate.data?.unit_price, X)) {
    pass("live.direct_update", `denied/no-op; unit_price still ${afterUpdate.data.unit_price}`);
  } else {
    fail("live.direct_update", `update=${directUpdate.error?.message || JSON.stringify(directUpdate.data)} stored=${afterUpdate.data?.unit_price}`);
  }

  const directDelete = await anon
    .from("order_items")
    .delete()
    .eq("order_id", orderId)
    .eq("order_item_id", ownItemId)
    .select("order_item_id");
  const afterDelete = await adminSb
    .from("order_items")
    .select("order_item_id")
    .eq("order_id", orderId)
    .eq("order_item_id", ownItemId)
    .maybeSingle();
  const deleteBlocked = rlsDenied(directDelete.error) || !(directDelete.data || []).length;
  if (deleteBlocked && afterDelete.data?.order_item_id) {
    pass("live.direct_delete", "denied/no-op; line still present");
  } else {
    fail("live.direct_delete", `delete=${directDelete.error?.message || "ALLOWED"} remaining=${afterDelete.data?.order_item_id}`);
  }

  const otherOrder = await adminSb
    .from("orders")
    .select("order_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", OTHER_LAB_ID)
    .limit(1)
    .maybeSingle();
  const crossInsert = await anon.from("order_items").insert({
    order_item_id: `OIN-XLAB-${Date.now()}`,
    order_id: otherOrder.data?.order_id || "ORD-NO-SUCH",
    tenant_id: QA_HQ_TENANT_ID,
    product_id: SKU,
    quantity: 1,
    unit_price: 1,
    total_price: 1,
  });
  if (rlsDenied(crossInsert.error) || crossInsert.error) {
    pass("live.cross_write", crossInsert.error.message);
  } else {
    fail("live.cross_write", "Lab wrote onto another lab/order");
  }
}

await anon.auth.signOut();
if (await signIn(QA_ADMIN, "admin")) {
  const hqRead = await anon
    .from("orders")
    .select("order_id,lab_id,total_amount")
    .eq("order_id", orderId)
    .maybeSingle();
  if (hqRead.data?.order_id && moneyEq(hqRead.data.total_amount, X * qty)) {
    pass("live.hq_read", `Admin sees ${orderId} total=${hqRead.data.total_amount}`);
  } else {
    fail("live.hq_read", hqRead.error?.message || "Admin cannot read 1B order");
  }

  const hqOnBehalf = await anon.rpc("create_lab_order", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: QA_LAB_ID,
    p_order_id: `ORD-1B-HQ-${Date.now()}`,
    p_items: [{ product_id: SKU, quantity: 1, unit_price: tamper }],
    p_client_request_id: `CRQ-1B-HQ-${Date.now()}`,
    p_status: "Placed",
    p_created_by: QA_ADMIN.email,
  });
  if (hqOnBehalf.error) fail("live.hq_on_behalf", hqOnBehalf.error.message);
  else pass("live.hq_on_behalf", "Admin create_lab_order succeeded");
}

if (failures) {
  console.error(`\nLAB ORDERING 1B verification failed (${failures}).`);
  process.exit(1);
}
console.log("\nLAB ORDERING 1B verification passed.");
process.exit(0);
