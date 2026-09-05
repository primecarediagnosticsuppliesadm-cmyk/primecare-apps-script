#!/usr/bin/env node
/**
 * Lab Ordering 1A — server-authoritative pricing + Lab identity security.
 *
 * Default: static only.
 * Live QA (mutates QA only; refuses Production):
 *   node scripts/verify-lab-ordering-1a-security.mjs --apply
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
const FOREIGN_TENANT = "00000000-0000-0000-0000-000000000001";
const MIGRATION_REL = "supabase/migrations/20260905120000_create_lab_order_server_authoritative_price.sql";
const SQL_TWIN_REL = "supabase/sql/create_lab_order_server_authoritative_price.sql";

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

function rpcDenied(rpc, tokens) {
  const msg = str(rpc?.error?.message).toLowerCase();
  return tokens.some((t) => msg.includes(String(t).toLowerCase()));
}

console.log("\n=== LAB ORDERING 1A SECURITY ===\n");

const migrationSrc = existsSync(resolve(root, MIGRATION_REL)) ? readSrc(MIGRATION_REL) : "";
const sqlTwinSrc = existsSync(resolve(root, SQL_TWIN_REL)) ? readSrc(SQL_TWIN_REL) : "";
const apiSrc = readSrc("src/api/primecareSupabaseApi.js");
const labPageSrc = readSrc("src/pages/LabOrderingPage.jsx");
const catalogViewSrc = readSrc("supabase/sql/lab_catalog_view_tenant_join_migration.sql");
const legacyRpcSrc = readSrc("supabase/migrations/20260703120000_lab_ordering_governance.sql");

if (migrationSrc.includes("CREATE OR REPLACE FUNCTION public.create_lab_order")) {
  pass("static.migration_present", MIGRATION_REL);
} else {
  fail("static.migration_present", "versioned create_lab_order migration missing");
}

if (sqlTwinSrc.includes("CREATE OR REPLACE FUNCTION public.create_lab_order")) {
  pass("static.sql_twin_present", SQL_TWIN_REL);
} else {
  fail("static.sql_twin_present", "manual SQL twin missing");
}

if (
  catalogViewSrc.includes("p.selling_price") &&
  catalogViewSrc.includes("AS unit_selling_price")
) {
  pass("static.price_source", "v_lab_catalog.unit_selling_price <- products.selling_price");
} else {
  fail("static.price_source", "catalog view price source not products.selling_price");
}

if (
  migrationSrc.includes("COALESCE(p.selling_price, 0)") &&
  !/v_unit\s*:=\s*COALESCE\(\(v_item->>'unit_price'\)/.test(migrationSrc)
) {
  pass("static.rpc_server_price", "create_lab_order persists products.selling_price; ignores client unit_price");
} else {
  fail("static.rpc_server_price", "RPC still binds client unit_price or missing selling_price");
}

if (/v_unit\s*:=\s*COALESCE\(\(v_item->>'unit_price'\)/.test(legacyRpcSrc)) {
  pass("static.legacy_vuln_documented", "prior create_lab_order persisted client unit_price");
} else {
  warn("static.legacy_vuln_documented", "legacy client-price assignment not found in 20260703 migration");
}

if (
  migrationSrc.includes("v_profile.lab_id") &&
  migrationSrc.includes("v_profile.tenant_id") &&
  migrationSrc.includes("RAISE EXCEPTION 'forbidden'")
) {
  pass("static.lab_identity", "Lab path derives tenant/lab from authenticated profile");
} else {
  fail("static.lab_identity", "Lab identity not derived from profile");
}

if (
  migrationSrc.includes("RAISE EXCEPTION 'inactive_profile'") &&
  migrationSrc.includes("RAISE EXCEPTION 'lab_inactive'") &&
  migrationSrc.includes("lab_ordering_allows_lab_initiate")
) {
  pass("static.eligibility", "inactive profile/lab + ordering_mode gates present");
} else {
  fail("static.eligibility", "eligibility exceptions missing");
}

if (
  migrationSrc.includes("RAISE EXCEPTION 'unknown_product'") &&
  migrationSrc.includes("RAISE EXCEPTION 'unorderable_product'") &&
  migrationSrc.includes("RAISE EXCEPTION 'invalid_order_line'") &&
  migrationSrc.includes("insufficient_inventory")
) {
  pass("static.product_qty", "unknown/unorderable/invalid qty + stock check present");
} else {
  fail("static.product_qty", "product/qty validation incomplete");
}

if (
  /does not deduct inventory/i.test(migrationSrc) &&
  !/UPDATE public\.inventory/i.test(migrationSrc)
) {
  pass("static.inventory_place", "PLACE path does not deduct inventory");
} else {
  fail("static.inventory_place", "inventory deduction found in create_lab_order or comment missing");
}

const rpcItemsMatch = apiSrc.match(
  /const rpcItems = normalizedLines\.map\(\(line\) => \(\{[\s\S]*?\}\)\);/
);
if (
  rpcItemsMatch &&
  rpcItemsMatch[0].includes("product_id: line.product_id") &&
  rpcItemsMatch[0].includes("quantity: line.quantity") &&
  !rpcItemsMatch[0].includes("unit_price")
) {
  pass("static.client_rpc_payload", "createOrderWrite RPC items send product_id + quantity only");
} else {
  fail("static.client_rpc_payload", "createOrderWrite still sends unit_price to create_lab_order");
}

if (apiSrc.includes('reason: "create_lab_order_rejected"')) {
  pass("static.no_legacy_bypass", "RPC rejection fails closed (no client-price legacy insert)");
} else {
  fail("static.no_legacy_bypass", "create_lab_order errors still fall back to legacy insert");
}

if (
  labPageSrc.includes("createOrderWrite") &&
  /items: cartSnapshot\.map\(\(item\) => \(\{[\s\S]*productId: item\.productId[\s\S]*quantity: Number\(item\.quantity/.test(
    labPageSrc
  ) &&
  !/items: cartSnapshot\.map\(\(item\) => \(\{[\s\S]*unitSellingPrice: Number\(item\.unitPrice/.test(labPageSrc)
) {
  pass("static.lab_submit_payload", "LabOrderingPage checkout items omit unitSellingPrice");
} else {
  fail("static.lab_submit_payload", "Lab submit payload still sends unitSellingPrice");
}

if (labPageSrc.includes("item.unitSellingPrice") && labPageSrc.includes("ProductCatalogCard")) {
  pass("static.catalog_display_price", "Lab UI still displays catalog unitSellingPrice");
} else {
  fail("static.catalog_display_price", "catalog display price missing from LabOrderingPage");
}

if (!APPLY) {
  console.log("\nStatic checks complete. Rerun with --apply for live QA probes (QA only).\n");
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
  auth: { persistSession: false },
});
const adminSb = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
if (!adminSb) {
  fail("live.service_role", "SUPABASE_SERVICE_ROLE_KEY missing — cannot restore QA fixtures safely");
  process.exit(1);
}

async function signIn(client, creds, label) {
  const { error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) fail(`live.auth.${label}`, error.message);
  else pass(`live.auth.${label}`, creds.email);
  return !error;
}

async function fetchLabFixture() {
  const labRes = await adminSb
    .from("labs")
    .select("lab_id,tenant_id,status,ordering_mode")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", QA_LAB_ID)
    .maybeSingle();
  const profileRes = await adminSb
    .from("profiles")
    .select("user_id,role,lab_id,tenant_id,active")
    .eq("lab_id", QA_LAB_ID)
    .eq("role", "lab")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  return { lab: labRes.data, profile: profileRes.data, labError: labRes.error, profileError: profileRes.error };
}

async function restoreLab(original) {
  if (!original?.lab) return;
  await adminSb
    .from("labs")
    .update({ ordering_mode: original.lab.ordering_mode, status: original.lab.status })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", QA_LAB_ID);
  if (original.profile?.user_id != null) {
    await adminSb.from("profiles").update({ active: true }).eq("user_id", original.profile.user_id);
  }
}

async function setLabMode(mode) {
  const { error } = await adminSb
    .from("labs")
    .update({ ordering_mode: mode })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", QA_LAB_ID);
  if (error) throw new Error(error.message);
}

async function setLabStatus(status) {
  const { error } = await adminSb
    .from("labs")
    .update({ status })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", QA_LAB_ID);
  if (error) throw new Error(error.message);
}

async function setProfileActive(userId, active) {
  const { error } = await adminSb.from("profiles").update({ active }).eq("user_id", userId);
  if (error) throw new Error(error.message);
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
      .gt("current_stock", 0)
      .maybeSingle();
    if (inv.data?.product_id) {
      return { ...row, current_stock: Number(inv.data.current_stock) };
    }
  }
  return null;
}

async function callCreate(client, { labId, tenantId, items, orderId }) {
  const oid = orderId || `ORD-1A-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rpc = await client.rpc("create_lab_order", {
    p_tenant_id: tenantId,
    p_lab_id: labId,
    p_order_id: oid,
    p_items: items,
    p_client_request_id: `CRQ-1A-${oid}`,
    p_status: "Placed",
    p_created_by: QA_LAB.email,
  });
  return { rpc, orderId: oid };
}

async function readOrderItems(orderId) {
  const { data, error } = await adminSb
    .from("order_items")
    .select("product_id,quantity,unit_price,total_price")
    .eq("order_id", orderId);
  return { data: data || [], error };
}

async function readOrder(orderId) {
  const { data, error } = await adminSb
    .from("orders")
    .select("order_id,lab_id,tenant_id,status,total_amount,inventory_updated")
    .eq("order_id", orderId)
    .maybeSingle();
  return { data, error };
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

const original = await fetchLabFixture();
if (!original.lab) {
  fail("live.fixture.lab", original.labError?.message || "QA_LAB_001 missing");
  process.exit(1);
}
if (!original.profile) {
  fail("live.fixture.profile", original.profileError?.message || "active lab profile missing");
  process.exit(1);
}

const product = await catalogProduct();
if (!product) {
  fail("live.fixture.product", "no active in-stock product with selling_price > 0");
  await restoreLab(original);
  process.exit(1);
}
pass(
  "live.fixture.product",
  `${product.product_id} selling_price=${product.selling_price} stock=${product.current_stock}`
);

const catalogPrice = Number(product.selling_price);
const tamperPrice = catalogPrice + 111.11;

try {
  await setLabMode("self_service");
  await setLabStatus("ACTIVE");
  await setProfileActive(original.profile.user_id, true);

  if (!(await signIn(anon, QA_LAB, "lab"))) {
    throw new Error("lab sign-in failed");
  }

  const stockBefore = await readStock(product.product_id);
  const tamper = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [
      {
        product_id: product.product_id,
        product_name: "TAMPER",
        quantity: 1,
        unit_price: tamperPrice,
      },
    ],
  });
  if (tamper.rpc.error) {
    fail("live.price_tamper", `request rejected: ${tamper.rpc.error.message}`);
  } else {
    const stored = await readOrderItems(tamper.orderId);
    const unit = Number(stored.data[0]?.unit_price);
    const order = await readOrder(tamper.orderId);
    if (moneyEq(unit, catalogPrice) && moneyEq(order.data?.total_amount, catalogPrice)) {
      pass(
        "live.price_tamper",
        `client sent ${tamperPrice}; stored unit_price=${unit} total=${order.data.total_amount}`
      );
    } else {
      fail(
        "live.price_tamper",
        `expected stored ${catalogPrice}, got unit=${unit} total=${order.data?.total_amount}`
      );
    }
    const stockAfter = await readStock(product.product_id);
    if (stockAfter === stockBefore) {
      pass("live.inventory_place", `stock unchanged after PLACE (${stockAfter})`);
    } else {
      fail("live.inventory_place", `stock changed ${stockBefore} -> ${stockAfter} on PLACE`);
    }
    if (order.data && order.data.lab_id === QA_LAB_ID && String(order.data.tenant_id) === QA_HQ_TENANT_ID) {
      pass("live.e2e.order_created", `${tamper.orderId} status=${order.data.status}`);
    } else {
      fail("live.e2e.order_created", "order missing or wrong lab/tenant");
    }

    const labOwn = await anon
      .from("orders")
      .select("order_id")
      .eq("order_id", tamper.orderId)
      .maybeSingle();
    if (labOwn.data?.order_id) pass("live.e2e.previous_orders", "Lab can read own order");
    else fail("live.e2e.previous_orders", labOwn.error?.message || "Lab cannot read own order");

    const labB = await anon
      .from("orders")
      .select("order_id,lab_id")
      .eq("lab_id", OTHER_LAB_ID)
      .limit(5);
    const leaked = (labB.data || []).filter((row) => str(row.lab_id) === OTHER_LAB_ID);
    if (labB.error) fail("live.order_isolation", labB.error.message);
    else if (leaked.length) fail("live.order_isolation", `Lab A read ${leaked.length} Lab B order(s)`);
    else pass("live.order_isolation", "Lab A cannot read QA_LAB_002 orders");

    await anon.auth.signOut();
    if (await signIn(anon, QA_ADMIN, "admin_hq")) {
      const hq = await anon
        .from("orders")
        .select("order_id,lab_id,total_amount")
        .eq("order_id", tamper.orderId)
        .maybeSingle();
      if (hq.data?.order_id) pass("live.hq_visibility", `Admin sees ${tamper.orderId}`);
      else fail("live.hq_visibility", hq.error?.message || "Admin cannot see lab order");
    }
    await anon.auth.signOut();
    await signIn(anon, QA_LAB, "lab_reauth");
  }

  const spoofLab = await callCreate(anon, {
    labId: OTHER_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: product.product_id, quantity: 1, unit_price: tamperPrice }],
  });
  const spoofCreated = spoofLab.rpc.error ? null : await readOrder(spoofLab.orderId);
  if (rpcDenied(spoofLab.rpc, ["forbidden"]) && spoofCreated?.data?.lab_id !== OTHER_LAB_ID) {
    pass("live.lab_spoof", "Lab A cannot create QA_LAB_002 order");
  } else {
    fail(
      "live.lab_spoof",
      spoofCreated?.data?.lab_id === OTHER_LAB_ID
        ? `created Lab B order ${spoofLab.orderId}`
        : spoofLab.rpc.error?.message || "spoof not denied"
    );
  }

  const spoofTenant = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: FOREIGN_TENANT,
    items: [{ product_id: product.product_id, quantity: 1, unit_price: tamperPrice }],
  });
  const spoofTenantOrder = spoofTenant.rpc.error ? null : await readOrder(spoofTenant.orderId);
  if (
    rpcDenied(spoofTenant.rpc, ["forbidden"]) &&
    String(spoofTenantOrder?.data?.tenant_id || "") !== FOREIGN_TENANT
  ) {
    pass("live.tenant_spoof", "foreign tenant_id denied");
  } else {
    fail("live.tenant_spoof", spoofTenant.rpc.error?.message || "tenant spoof not denied");
  }

  const badProduct = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: "NO_SUCH_SKU_1A", quantity: 1 }],
  });
  if (rpcDenied(badProduct.rpc, ["unknown_product"])) pass("live.invalid_product", "unknown product denied");
  else fail("live.invalid_product", badProduct.rpc.error?.message || "unknown product accepted");

  const badQty = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: product.product_id, quantity: 0, unit_price: tamperPrice }],
  });
  if (rpcDenied(badQty.rpc, ["invalid_order_line"])) pass("live.invalid_quantity", "quantity <= 0 denied");
  else fail("live.invalid_quantity", badQty.rpc.error?.message || "invalid quantity accepted");

  const catalogInsert = await anon.from("products").insert({
    tenant_id: QA_HQ_TENANT_ID,
    product_id: `LAB-HACK-${Date.now()}`,
    product_name: "Should fail",
    selling_price: 1,
    active: true,
  });
  const catalogUpdate = await anon
    .from("products")
    .update({ selling_price: 1 })
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("product_id", product.product_id)
    .select("product_id,selling_price");
  const catalogDelete = await anon
    .from("products")
    .delete()
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("product_id", product.product_id)
    .select("product_id");
  const afterWrite = await adminSb
    .from("products")
    .select("product_id,selling_price")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("product_id", product.product_id)
    .maybeSingle();
  const insertBlocked = Boolean(catalogInsert.error);
  const updateBlocked = Boolean(catalogUpdate.error) || !(catalogUpdate.data || []).length;
  const deleteBlocked = Boolean(catalogDelete.error) || !(catalogDelete.data || []).length;
  const rowIntact =
    afterWrite.data?.product_id === product.product_id &&
    moneyEq(afterWrite.data?.selling_price, catalogPrice);
  if (insertBlocked && updateBlocked && deleteBlocked && rowIntact) {
    pass("live.catalog_denied", "Lab cannot insert/update/delete products (row unchanged)");
  } else {
    fail(
      "live.catalog_denied",
      `insert=${catalogInsert.error?.message || "ALLOWED"} update=${catalogUpdate.error?.message || `rows=${(catalogUpdate.data || []).length}`} delete=${catalogDelete.error?.message || `rows=${(catalogDelete.data || []).length}`} intact=${rowIntact}`
    );
  }

  await setLabMode("hq_managed");
  const hqManaged = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: product.product_id, quantity: 1 }],
  });
  if (rpcDenied(hqManaged.rpc, ["lab_ordering_blocked"])) pass("live.hq_managed", "Lab initiate denied");
  else fail("live.hq_managed", hqManaged.rpc.error?.message || "hq_managed allowed Lab initiate");

  await setLabMode("hybrid");
  const hybrid = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: product.product_id, quantity: 1 }],
  });
  if (hybrid.rpc.error) fail("live.hybrid", hybrid.rpc.error.message);
  else pass("live.hybrid", `permitted ${hybrid.orderId}`);

  await setLabMode("self_service");
  const selfService = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: product.product_id, quantity: 1 }],
  });
  if (selfService.rpc.error) fail("live.self_service", selfService.rpc.error.message);
  else pass("live.self_service", `permitted ${selfService.orderId}`);

  await anon.auth.signOut();
  if (await signIn(anon, QA_ADMIN, "admin_on_behalf")) {
    const hqOrder = await callCreate(anon, {
      labId: QA_LAB_ID,
      tenantId: QA_HQ_TENANT_ID,
      items: [{ product_id: product.product_id, quantity: 1, unit_price: tamperPrice }],
    });
    if (hqOrder.rpc.error) fail("live.hq_on_behalf", hqOrder.rpc.error.message);
    else {
      const stored = await readOrderItems(hqOrder.orderId);
      const unit = Number(stored.data[0]?.unit_price);
      if (moneyEq(unit, catalogPrice)) pass("live.hq_on_behalf", `${hqOrder.orderId} server price ${unit}`);
      else fail("live.hq_on_behalf", `HQ path stored ${unit}, expected ${catalogPrice}`);
    }
  }
  await anon.auth.signOut();
  await signIn(anon, QA_LAB, "lab_before_inactive");

  await setProfileActive(original.profile.user_id, false);
  await anon.auth.signOut();
  const inactiveProfileClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await signIn(inactiveProfileClient, QA_LAB, "inactive_profile");
  const inactiveProfile = await callCreate(inactiveProfileClient, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: product.product_id, quantity: 1 }],
  });
  if (rpcDenied(inactiveProfile.rpc, ["inactive_profile", "forbidden"])) {
    pass("live.inactive_profile", inactiveProfile.rpc.error.message);
  } else {
    fail("live.inactive_profile", inactiveProfile.rpc.error?.message || "inactive profile allowed");
  }
  await setProfileActive(original.profile.user_id, true);
  await inactiveProfileClient.auth.signOut();

  await signIn(anon, QA_LAB, "lab_after_profile");
  await setLabStatus("INACTIVE");
  const inactiveLab = await callCreate(anon, {
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    items: [{ product_id: product.product_id, quantity: 1 }],
  });
  if (rpcDenied(inactiveLab.rpc, ["lab_inactive", "forbidden"])) {
    pass("live.inactive_lab", inactiveLab.rpc.error.message);
  } else {
    fail("live.inactive_lab", inactiveLab.rpc.error?.message || "inactive lab allowed");
  }
} catch (err) {
  fail("live.exception", err?.message || String(err));
} finally {
  await restoreLab(original);
  const restored = await fetchLabFixture();
  pass(
    "live.restore",
    `ordering_mode=${restored.lab?.ordering_mode} status=${restored.lab?.status} profile.active=${restored.profile?.active}`
  );
}

if (failures) {
  console.error(`\nLAB ORDERING 1A verification failed (${failures}).`);
  process.exit(1);
}
console.log("\nLAB ORDERING 1A verification passed.");
process.exit(0);
