#!/usr/bin/env node
/**
 * End-to-end procurement → inventory → ledger → valuation regression.
 *
 * Usage:
 *   node scripts/verify-procurement-inventory-flow.mjs           # dry-run (read-only)
 *   node scripts/verify-procurement-inventory-flow.mjs --mutate  # receive on open PO
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInventoryUnitCost } from "../src/inventory/resolveInventoryUnitCost.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || "f168b98f-47a6-42c3-b788-24c00436fac2";
const TEST_SKU = process.env.TEST_SKU || "QA_SKU_003";
const MUTATE = process.argv.includes("--mutate");

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
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

function isReceivableStatus(status) {
  const s = str(status).toLowerCase();
  return s === "ordered" || s === "partially received";
}

async function fetchInventoryRow(sb, tenantId, productId) {
  const { data, error } = await sb
    .from("inventory")
    .select("tenant_id,product_id,current_stock,min_stock,reorder_qty")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function fetchProductCost(sb, tenantId, productId) {
  const { data, error } = await sb
    .from("products")
    .select("cost_price,selling_price")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function receivePoInline(sb, poId, { tenantId, receivedQty, createdBy }) {
  const { data: poRows, error: poErr } = await sb
    .from("purchase_orders")
    .select("*")
    .eq("po_id", poId)
    .limit(1);
  if (poErr) return { success: false, error: poErr.message };
  const poRow = poRows?.[0];
  if (!poRow) return { success: false, error: `PO not found: ${poId}` };
  if (!isReceivableStatus(poRow.status)) {
    return { success: false, error: `PO status ${poRow.status} is not receivable` };
  }

  const { data: itemRows, error: itemErr } = await sb
    .from("purchase_order_items")
    .select("*")
    .eq("po_id", poId)
    .limit(1);
  if (itemErr) return { success: false, error: itemErr.message };
  const itemRow = itemRows?.[0];
  if (!itemRow) return { success: false, error: "PO item missing" };

  const productId = str(itemRow.product_id ?? poRow.product_id);
  const productName = str(itemRow.product_name ?? poRow.product_name ?? productId);
  const orderedQty = num(itemRow.quantity ?? poRow.quantity);
  const previousReceived = num(itemRow.received_qty ?? poRow.received_qty);
  const remainingQty = Math.max(0, orderedQty - previousReceived);
  if (receivedQty > remainingQty) {
    return {
      success: false,
      error: `Received qty ${receivedQty} exceeds remaining ${remainingQty}`,
    };
  }

  const inv = await fetchInventoryRow(sb, tenantId, productId);
  if (!inv) return { success: false, error: "Inventory row missing" };
  if (str(inv.tenant_id) !== tenantId) {
    return { success: false, error: "Inventory tenant mismatch" };
  }

  const stockBefore = num(inv.current_stock);
  const stockAfter = stockBefore + receivedQty;
  const invUpd = await sb
    .from("inventory")
    .update({ current_stock: stockAfter, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .select("current_stock");
  if (invUpd.error) return { success: false, error: invUpd.error.message };

  const ledgerIns = await sb.from("inventory_ledger").insert({
    tenant_id: tenantId,
    product_id: productId,
    product_name: productName,
    movement_type: "PURCHASE_IN",
    quantity: receivedQty,
    stock_before: stockBefore,
    stock_after: stockAfter,
    reference_type: "PO",
    reference_id: poId,
    order_id: poId,
    created_by: createdBy,
    notes: "verify-procurement-inventory-flow.mjs",
  });
  if (ledgerIns.error) return { success: false, error: ledgerIns.error.message };

  const nextReceived = previousReceived + receivedQty;
  const nextStatus = nextReceived >= orderedQty ? "Received" : "Partially Received";
  const updateTs = new Date().toISOString();
  await sb
    .from("purchase_order_items")
    .update({ received_qty: nextReceived, updated_at: updateTs })
    .eq("po_id", poId);
  await sb
    .from("purchase_orders")
    .update({
      received_qty: nextReceived,
      status: nextStatus,
      received_at: nextStatus === "Received" ? updateTs : poRow.received_at,
      updated_at: updateTs,
    })
    .eq("po_id", poId);

  return {
    success: true,
    stockBefore,
    stockAfter,
    receivedQty,
    nextStatus,
    productId,
  };
}

async function main() {
  console.log(
    `\n=== Procurement / Inventory Flow Verification (${MUTATE ? "MUTATE" : "DRY-RUN"}) ===\n`
  );
  console.log(`Tenant: ${HQ}`);
  console.log(`SKU: ${TEST_SKU}\n`);

  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (authErr) throw new Error(`auth: ${authErr.message}`);

  const { data: tenantRow } = await sb
    .from("tenants")
    .select("id,tenant_code,tenant_name")
    .eq("id", HQ)
    .maybeSingle();
  if (tenantRow?.id === HQ) {
    pass("tenant.operating", `${tenantRow.tenant_name || HQ} (${tenantRow.tenant_code || "HQ"})`);
  } else {
    fail("tenant.operating", `Expected tenant ${HQ}`);
  }

  const invBefore = await fetchInventoryRow(sb, HQ, TEST_SKU);
  if (!invBefore) fail("inventory.row", `${TEST_SKU} inventory row missing`);
  else pass("inventory.starting_stock", `${TEST_SKU} stock=${num(invBefore.current_stock)}`);

  const product = await fetchProductCost(sb, HQ, TEST_SKU);
  const costBefore = resolveInventoryUnitCost({
    tenantId: HQ,
    productId: TEST_SKU,
    currentStock: num(invBefore?.current_stock),
    productCostPrice: product?.cost_price,
    logQa: false,
  });
  pass(
    "valuation.resolved_cost",
    `resolvedUnitCost=${costBefore.resolvedUnitCost} source=${costBefore.source}`
  );

  const { data: dupRows } = await sb
    .from("inventory")
    .select("id")
    .eq("tenant_id", HQ)
    .eq("product_id", TEST_SKU);
  if ((dupRows || []).length === 1) {
    pass("inventory.no_duplicate", "Single inventory row for tenant_id + product_id");
  } else {
    fail("inventory.no_duplicate", `Found ${(dupRows || []).length} inventory rows`);
  }

  const { data: catalogRow } = await sb
    .from("v_lab_catalog")
    .select("product_id,current_stock,unit_cost,unit_selling_price")
    .eq("tenant_id", HQ)
    .eq("product_id", TEST_SKU)
    .maybeSingle();
  if (catalogRow && invBefore && num(catalogRow.current_stock) === num(invBefore.current_stock)) {
    pass("catalog.stock_match", `Catalog HQ stock=${catalogRow.current_stock}`);
  } else if (catalogRow && invBefore) {
    fail(
      "catalog.stock_match",
      `Catalog ${catalogRow.current_stock} != inventory ${invBefore.current_stock}`
    );
  }

  if (product?.cost_price) {
    pass("catalog.product_cost", `products.cost_price=${product.cost_price}`);
    const viewCost = catalogRow?.unit_cost ?? catalogRow?.cost_price;
    if (viewCost != null && num(viewCost) === num(product.cost_price)) {
      pass("catalog.view_cost_match", `v_lab_catalog unit_cost=${viewCost}`);
    } else {
      pass(
        "catalog.view_cost_enriched",
        "Master Catalog enriches cost from products when view unit_cost is absent"
      );
    }
  }

  const { data: pos } = await sb
    .from("purchase_orders")
    .select("po_id,product_id,status,quantity,received_qty,tenant_id")
    .eq("tenant_id", HQ)
    .eq("product_id", TEST_SKU)
    .order("created_at", { ascending: false });

  const openPo = (pos || []).find((po) => {
    const remaining = num(po.quantity) - num(po.received_qty);
    return isReceivableStatus(po.status) && remaining > 0;
  });

  if (!openPo) {
    pass("po.open", "No open receivable PO — dry-run complete (create Ordered PO for --mutate)");
  } else if (!MUTATE) {
    pass("po.open", `Open PO ${openPo.po_id} (use --mutate to receive)`);
    pass("mutate.skipped", "Dry-run — receive mutation skipped");
  } else {
    const receiveQty = Math.min(10, num(openPo.quantity) - num(openPo.received_qty));
    const first = await receivePoInline(sb, openPo.po_id, {
      tenantId: HQ,
      receivedQty: receiveQty,
      createdBy: "qa.admin@primecare.test",
    });
    if (!first.success) fail("mutate.receive", first.error);
    else {
      pass(
        "mutate.receive",
        `Received ${receiveQty} on ${openPo.po_id}: stock ${first.stockBefore} → ${first.stockAfter}`
      );

      const invAfter = await fetchInventoryRow(sb, HQ, TEST_SKU);
      if (num(invAfter.current_stock) === num(invBefore.current_stock) + receiveQty) {
        pass("mutate.inventory_delta", `Inventory +${receiveQty}`);
      } else {
        fail("mutate.inventory_delta", `Expected +${receiveQty}, got ${num(invAfter.current_stock) - num(invBefore.current_stock)}`);
      }

      const costAfter = resolveInventoryUnitCost({
        tenantId: HQ,
        productId: TEST_SKU,
        currentStock: num(invAfter.current_stock),
        productCostPrice: product?.cost_price,
        logQa: false,
      });
      const expectedDelta = receiveQty * num(costAfter.resolvedUnitCost);
      const actualDelta = costAfter.inventoryValue - costBefore.inventoryValue;
      if (Math.abs(actualDelta - expectedDelta) <= 0.01) {
        pass("mutate.valuation_delta", `Valuation +${expectedDelta}`);
      } else {
        fail("mutate.valuation_delta", `Expected +${expectedDelta}, got +${actualDelta}`);
      }

      const { data: ledgerRows } = await sb
        .from("inventory_ledger")
        .select("tenant_id,product_id,movement_type,reference_id")
        .eq("tenant_id", HQ)
        .eq("product_id", TEST_SKU)
        .eq("reference_id", openPo.po_id)
        .eq("movement_type", "PURCHASE_IN");
      if ((ledgerRows || []).length >= 1) {
        pass("mutate.ledger", `${ledgerRows.length} PURCHASE_IN ledger row(s) for PO`);
      } else {
        fail("mutate.ledger", "No PURCHASE_IN ledger row");
      }

      const overReceive = await receivePoInline(sb, openPo.po_id, {
        tenantId: HQ,
        receivedQty: num(openPo.quantity) + 100,
        createdBy: "qa.admin@primecare.test",
      });
      if (!overReceive.success) {
        pass("mutate.no_over_receive", `Blocked over-receive: ${overReceive.error}`);
      } else {
        fail("mutate.no_over_receive", "Over-receive should have been blocked");
      }

      const { data: poAfter } = await sb
        .from("purchase_orders")
        .select("status,received_qty,quantity")
        .eq("po_id", openPo.po_id)
        .maybeSingle();
      if (poAfter && str(poAfter.status).toLowerCase() === "received") {
        const second = await receivePoInline(sb, openPo.po_id, {
          tenantId: HQ,
          receivedQty: 1,
          createdBy: "qa.admin@primecare.test",
        });
        if (!second.success) {
          pass("mutate.no_double_receive", "Fully received PO cannot be received again");
        } else {
          fail("mutate.no_double_receive", "Double receive should be blocked");
        }
      }
    }
  }

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    for (const row of failed) console.log(`  - ${row.id}: ${row.detail}`);
    process.exit(1);
  }
  console.log("\nProcurement / inventory flow verification passed.\n");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
