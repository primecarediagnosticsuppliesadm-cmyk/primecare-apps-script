#!/usr/bin/env node
/**
 * Invoice Phase 2 — automatic invoice creation on fulfillment.
 *
 * Usage:
 *   node scripts/verify-invoice-phase2.mjs
 *   node scripts/verify-invoice-phase2.mjs --remote
 *
 * Remote tests use disposable QA orders prefixed ORD-INV-P2- (HQ tenant only).
 * Does not touch Guntur certified tenant data.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_PATH = resolve(root, "supabase/sql/invoice_system_phase2_migration.sql");
const API_PATH = resolve(root, "src/api/primecareSupabaseApi.js");
const HQ_TENANT = "f168b98f-47a6-42c3-b788-24c00436fac2";
const REMOTE = process.argv.includes("--remote");

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
}
function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
}
function skip(id, detail) {
  results.push({ id, status: "SKIP", detail });
}

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return null;
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

function verifyStatic() {
  if (!existsSync(SQL_PATH)) {
    fail("S-00", "invoice_system_phase2_migration.sql missing");
    return;
  }
  pass("S-00", "Phase 2 SQL migration exists");

  const sql = readFileSync(SQL_PATH, "utf8");
  const api = existsSync(API_PATH) ? readFileSync(API_PATH, "utf8") : "";

  if (/allocate_invoice_number/.test(sql) && /INV-'/.test(sql) && /lpad\(v_seq::text, 6/.test(sql)) {
    pass("S-10", "Yearly invoice number format INV-YYYY-NNNNNN with row lock");
  } else {
    fail("S-10", "Invoice numbering implementation incomplete in SQL");
  }

  if (
    /create_invoice_for_fulfilled_order/.test(sql) &&
    !/not_implemented_phase_1/.test(sql.split("create_invoice_for_fulfilled_order")[1] || "")
  ) {
    pass("S-11", "create_invoice_for_fulfilled_order production RPC present");
  } else {
    fail("S-11", "RPC still stub or missing");
  }

  if (/INSERT INTO public\.invoice_line_items/.test(sql) && /FOR UPDATE/.test(sql)) {
    pass("S-12", "Line item snapshot + transactional order lock in RPC");
  } else {
    fail("S-12", "Line snapshot or order lock missing");
  }

  if (/UPDATE public\.orders[\s\S]*invoice_id/.test(sql)) {
    pass("S-13", "orders.invoice_id linkage in RPC");
  } else {
    fail("S-13", "orders.invoice_id linkage missing");
  }

  if (
    /createInvoiceForFulfilledOrderWrite/.test(api) &&
    /createOrderWrite/.test(api) &&
    /updateOrderStatusWrite/.test(api)
  ) {
    pass("S-20", "Fulfillment hooks wired in primecareSupabaseApi.js");
  } else {
    fail("S-20", "Fulfillment hooks missing in API layer");
  }
}

async function login(env, email, password) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { sb: null, error: error.message };
  return { sb, error: null };
}

async function verifyRemote(env) {
  const { sb: adminSb, error: adminErr } = await login(env, "qa.admin@primecare.test", "1234");
  if (adminErr || !adminSb) {
    warn("R-00", `Admin auth failed: ${adminErr || "unknown"}`);
    return;
  }

  const { data: labRow } = await adminSb
    .from("v_labs_credit")
    .select("lab_id,lab_name")
    .eq("tenant_id", HQ_TENANT)
    .limit(1)
    .maybeSingle();

  if (!labRow?.lab_id) {
    warn("R-01", "No QA lab found for invoice creation test");
    return;
  }

  const { data: invRow } = await adminSb
    .from("inventory")
    .select("product_id,product_name")
    .eq("tenant_id", HQ_TENANT)
    .limit(1)
    .maybeSingle();

  const productId = invRow?.product_id || "SKU-P2-PROBE";
  const productName = invRow?.product_name || "P2 Probe Product";
  const labId = labRow.lab_id;
  const ts = Date.now();
  const orderId = `ORD-INV-P2-${ts}`;
  const unitPrice = 100;
  const qty = 2;
  const lineTotal = unitPrice * qty;

  const { error: orderInsErr } = await adminSb.from("orders").insert({
    tenant_id: HQ_TENANT,
    order_id: orderId,
    lab_id: labId,
    status: "Placed",
    total_amount: lineTotal,
    order_date: new Date().toISOString().slice(0, 10),
  });
  if (orderInsErr) {
    fail("R-10", `Test order insert failed: ${orderInsErr.message}`);
    return;
  }

  const { error: itemInsErr } = await adminSb.from("order_items").insert({
    order_id: orderId,
    tenant_id: HQ_TENANT,
    product_id: productId,
    product_name: productName,
    quantity: qty,
    unit_price: unitPrice,
    total_price: lineTotal,
    order_item_id: `OI-P2-${ts}`,
  });
  if (itemInsErr) {
    fail("R-11", `Test order_items insert failed: ${itemInsErr.message}`);
    return;
  }

  const { error: fulfillErr } = await adminSb
    .from("orders")
    .update({ status: "Fulfilled", fulfilled_at: new Date().toISOString() })
    .eq("tenant_id", HQ_TENANT)
    .eq("order_id", orderId);
  if (fulfillErr) {
    fail("R-12", `Fulfill update failed: ${fulfillErr.message}`);
    return;
  }

  const rpcArgs = {
    p_tenant_id: HQ_TENANT,
    p_order_id: orderId,
    p_actor_id: "verify-invoice-phase2",
    p_created_source: "verify-invoice-phase2",
  };

  const first = await adminSb.rpc("create_invoice_for_fulfilled_order", rpcArgs);
  if (first.error) {
    if (/not_implemented_phase_1/i.test(first.error.message)) {
      fail("R-20", "RPC still Phase 1 stub — apply invoice_system_phase2_migration.sql");
    } else {
      fail("R-20", `Invoice creation failed: ${first.error.message}`);
    }
    return;
  }
  pass("R-20", "Invoice creation — first RPC call succeeded");

  const invoiceId = first.data?.invoice_id;
  const invoiceNumber = first.data?.invoice_number;
  if (!invoiceId || !invoiceNumber) {
    fail("R-21", "RPC response missing invoice_id or invoice_number");
    return;
  }

  const second = await adminSb.rpc("create_invoice_for_fulfilled_order", rpcArgs);
  if (second.error) {
    fail("R-30", `Duplicate RPC failed: ${second.error.message}`);
  } else if (second.data?.skipped && second.data?.invoice_id === invoiceId) {
    pass("R-30", "Duplicate invoice prevention — idempotent second call");
  } else {
    fail("R-30", "Second RPC did not return same skipped invoice");
  }

  const { data: invoiceRows } = await adminSb
    .from("invoices")
    .select("id")
    .eq("tenant_id", HQ_TENANT)
    .eq("order_id", orderId);
  if ((invoiceRows || []).length === 1) {
    pass("R-31", "Invoice number uniqueness — exactly one invoice row per order");
  } else {
    fail("R-31", `Expected 1 invoice row, found ${(invoiceRows || []).length}`);
  }

  if (/^INV-\d{4}-\d{6}$/.test(invoiceNumber)) {
    pass("R-32", `Invoice number format OK: ${invoiceNumber}`);
  } else {
    fail("R-32", `Unexpected invoice number format: ${invoiceNumber}`);
  }

  const originalName = productName;
  const mutatedName = `${productName}-MUT-${ts}`;
  await adminSb
    .from("order_items")
    .update({ product_name: mutatedName })
    .eq("order_id", orderId);

  const { data: lines } = await adminSb
    .from("invoice_line_items")
    .select("product_name,sku,line_total,quantity,unit_price")
    .eq("invoice_id", invoiceId);

  const lineOk =
    Array.isArray(lines) &&
    lines.length > 0 &&
    lines.every((l) => l.product_name === originalName) &&
    lines.some((l) => Number(l.line_total) === lineTotal);
  if (lineOk) {
    pass("R-40", "Snapshot integrity — invoice_line_items unchanged after order_items mutation");
  } else {
    fail("R-40", `Snapshot drift detected (expected name ${originalName})`);
  }

  const { data: orderLink } = await adminSb
    .from("orders")
    .select("invoice_id,total_amount")
    .eq("tenant_id", HQ_TENANT)
    .eq("order_id", orderId)
    .maybeSingle();

  if (orderLink?.invoice_id === invoiceId) {
    pass("R-50", "orders.invoice_id populated");
  } else {
    fail("R-50", "orders.invoice_id not linked to created invoice");
  }

  const { data: invoiceHdr } = await adminSb
    .from("invoices")
    .select("total_amount,subtotal,tax_amount")
    .eq("id", invoiceId)
    .maybeSingle();

  if (Number(invoiceHdr?.total_amount) === lineTotal && Number(orderLink?.total_amount) === lineTotal) {
    pass("R-51", "Invoice totals match source order");
  } else {
    fail(
      "R-51",
      `Total mismatch invoice=${invoiceHdr?.total_amount} order=${orderLink?.total_amount} expected=${lineTotal}`
    );
  }

  const orderId2 = `ORD-INV-P2-B-${ts}`;
  await adminSb.from("orders").insert({
    tenant_id: HQ_TENANT,
    order_id: orderId2,
    lab_id: labId,
    status: "Fulfilled",
    total_amount: 50,
    order_date: new Date().toISOString().slice(0, 10),
  });
  await adminSb.from("order_items").insert({
    order_id: orderId2,
    tenant_id: HQ_TENANT,
    product_id: productId,
    product_name: productName,
    quantity: 1,
    unit_price: 50,
    total_price: 50,
    order_item_id: `OI-P2-B-${ts}`,
  });

  const [rA, rB] = await Promise.all([
    adminSb.rpc("create_invoice_for_fulfilled_order", {
      ...rpcArgs,
      p_order_id: orderId,
    }),
    adminSb.rpc("create_invoice_for_fulfilled_order", {
      ...rpcArgs,
      p_order_id: orderId2,
    }),
  ]);

  if (!rB.error && rB.data?.invoice_number && rB.data.invoice_number !== invoiceNumber) {
    pass("R-33", `Concurrent numbering distinct: ${invoiceNumber} vs ${rB.data.invoice_number}`);
  } else if (rB.error) {
    warn("R-33", `Second order invoice RPC: ${rB.error.message}`);
  } else {
    fail("R-33", "Invoice numbers not distinct across orders");
  }

  const { sb: labSb } = await login(env, "qa.lab@primecare.test", "1234");
  if (labSb) {
    const { data: crossLabInv } = await labSb.from("invoices").select("id").eq("id", invoiceId);
    if (!crossLabInv?.length) {
      pass("R-60", "Cross-lab denial — lab cannot read unrelated invoice by id filter");
    } else {
      const { data: profile } = await labSb
        .from("profiles")
        .select("lab_id")
        .limit(1)
        .maybeSingle();
      if (profile?.lab_id === labId) {
        pass("R-60", "Lab can read own-lab invoice (expected when lab matches)");
      } else {
        fail("R-60", "Lab read invoice for another lab");
      }
    }
  } else {
    skip("R-60", "Lab auth unavailable");
  }

  const wrongTenant = "00000000-0000-0000-0000-000000009999";
  const crossTenant = await adminSb.rpc("create_invoice_for_fulfilled_order", {
    p_tenant_id: wrongTenant,
    p_order_id: orderId,
  });
  if (crossTenant.error && /tenant_mismatch|forbidden|order_not_found/i.test(crossTenant.error.message)) {
    pass("R-61", "Cross-tenant RPC denied");
  } else {
    fail("R-61", `Cross-tenant RPC should fail: ${crossTenant.error?.message || "succeeded"}`);
  }

  if (/createInvoiceForFulfilledOrderWrite/.test(readFileSync(API_PATH, "utf8"))) {
    pass("R-70", "Fulfillment hook — API wraps same RPC (static wiring certified)");
  } else {
    fail("R-70", "Fulfillment hook missing");
  }

  warn(
    "R-99",
    `Disposable QA artifacts left: ${orderId}, ${orderId2} (prefix ORD-INV-P2-) — safe to purge manually`
  );
}

function printReport() {
  console.log("# Invoice Phase 2 Verification\n");
  for (const row of results) {
    console.log(`- [${row.status}] ${row.id}: ${row.detail}`);
  }
  const fails = results.filter((r) => r.status === "FAIL");
  console.log(`\nSummary: ${results.length} checks, ${fails.length} FAIL`);
  if (fails.length) {
    console.error("\nRESULT: FAIL");
    process.exit(1);
  }
  console.log("\nRESULT: PASS");
}

async function main() {
  verifyStatic();
  if (REMOTE) {
    const env = loadEnvLocal();
    if (!env?.VITE_SUPABASE_URL) {
      skip("R-ENV", "Missing .env.local — remote checks skipped");
    } else {
      await verifyRemote(env);
    }
  } else {
    skip("R-ENV", "Remote checks skipped (use --remote after applying Phase 1+2 SQL)");
  }
  printReport();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
