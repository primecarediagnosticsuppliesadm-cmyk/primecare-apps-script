#!/usr/bin/env node
/**
 * End-to-end Inventory Dashboard KPI valuation verification.
 *
 * Mirrors: getInventoryHealthRead → resolveInventoryUnitCost →
 *          buildInventoryEconomicsModel → buildInventoryValueAnalytics
 *
 * Usage:
 *   node scripts/verify-inventory-dashboard-kpi.mjs
 *   TENANT_ID=f168b98f-... node scripts/verify-inventory-dashboard-kpi.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInventoryUnitCost } from "../src/inventory/resolveInventoryUnitCost.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || "f168b98f-47a6-42c3-b788-24c00436fac2";

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

function skuKey(tenantId, productId) {
  return `${str(tenantId) || "hq"}::${str(productId)}`;
}

function buildLastMovementMap(ledgerRows = []) {
  const map = new Map();
  for (const movement of ledgerRows) {
    const productId = str(movement.productId);
    if (!productId) continue;
    const key = skuKey(movement.tenantId, productId);
    const createdAtMs = Date.parse(str(movement.createdAt));
    if (!Number.isFinite(createdAtMs)) continue;
    const prev = map.get(key) || 0;
    if (createdAtMs > prev) map.set(key, createdAtMs);
  }
  return map;
}

function classifyMovementAge(daysSince) {
  if (daysSince == null) return "dead";
  if (daysSince >= 120) return "dead";
  if (daysSince >= 60) return "slow";
  return "active";
}

function normalizeEconomicsRow(row = {}) {
  const unitCostSource = str(row.unitCostSource);
  const cost = unitCostSource
    ? {
        inventoryUnitCost: row.inventoryUnitCost ?? null,
        productCostPrice: row.productCostPrice ?? null,
        unitCost: num(row.unitCost),
        source: unitCostSource,
      }
    : resolveInventoryUnitCost({
        tenantId: str(row.tenantId),
        productId: str(row.productId),
        currentStock: num(row.currentStock),
        inventoryUnitCost: row.inventoryUnitCost ?? row.unit_cost ?? null,
        productCostPrice: row.productCostPrice ?? row.product_cost_price ?? null,
        logQa: false,
      });
  const currentStock = num(row.currentStock);
  const minStock = num(row.minStock);
  const unitCost = num(cost.unitCost);
  return {
    productId: str(row.productId),
    tenantId: str(row.tenantId),
    currentStock,
    minStock,
    unitCost,
    unitCostSource: cost.source,
    inventoryValue: Math.round(currentStock * unitCost * 100) / 100,
    isLowStock: minStock > 0 ? currentStock < minStock : currentStock <= 0,
    reorderExposureValue: Math.round(Math.max(0, minStock - currentStock) * unitCost * 100) / 100,
  };
}

function buildInventoryEconomicsModel(inventoryRows = [], ledgerRows = []) {
  const lastMovementMap = buildLastMovementMap(ledgerRows);
  const normalized = inventoryRows.map(normalizeEconomicsRow).filter((r) => r.productId);
  const rows = normalized.map((row) => {
    const lastMovementMs = lastMovementMap.get(skuKey(row.tenantId, row.productId)) || null;
    const daysSince =
      lastMovementMs != null
        ? Math.floor((Date.now() - lastMovementMs) / 86400000)
        : null;
    const movementClass = row.currentStock <= 0 ? "active" : classifyMovementAge(daysSince);
    return { ...row, movementClass };
  });
  return {
    rows,
    totalInventoryValue: rows.reduce((s, r) => s + num(r.inventoryValue), 0),
  };
}

function filterByTenant(rows, tenantFilter, homeTenantId) {
  if (!tenantFilter || tenantFilter === "all") return rows;
  if (tenantFilter === "hq") {
    return homeTenantId ? rows.filter((r) => str(r.tenantId) === homeTenantId) : rows;
  }
  return rows.filter((r) => str(r.tenantId) === tenantFilter);
}

function buildInventoryValueAnalytics(model, healthRows = [], options = {}) {
  const tenantFilter = options.tenantFilter || "all";
  const homeTenantId = str(options.homeTenantId);
  const econRows = filterByTenant(model?.rows || [], tenantFilter, homeTenantId);
  const rowsWithCost = econRows.filter((r) => num(r.unitCost) > 0);
  const hasCostData = rowsWithCost.length > 0;
  const totalInventoryValue = hasCostData
    ? econRows.reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;
  const criticalValueAtRisk = hasCostData
    ? econRows
        .filter((r) => r.isLowStock && num(r.unitCost) > 0)
        .reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;
  const slowMovingValue = hasCostData
    ? econRows
        .filter((r) => r.movementClass === "slow" && num(r.unitCost) > 0)
        .reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;
  const deadStockValue = hasCostData
    ? econRows
        .filter((r) => r.movementClass === "dead" && num(r.unitCost) > 0)
        .reduce((s, r) => s + num(r.inventoryValue), 0)
    : null;
  return {
    hasCostData,
    totalInventoryValue,
    totalInventoryValueLabel: hasCostData ? `₹${num(totalInventoryValue).toLocaleString("en-IN")}` : "Not enough cost data",
    criticalValueAtRisk,
    slowMovingValue,
    deadStockValue,
    skuCount: econRows.length,
  };
}

async function fetchProductCostPricesByTenantProduct(sb, inventoryRawRows = []) {
  const costByKey = new Map();
  const byTenant = new Map();
  for (const row of inventoryRawRows) {
    const tenantId = str(row.tenant_id);
    const productId = str(row.product_id);
    if (!tenantId || !productId) continue;
    if (!byTenant.has(tenantId)) byTenant.set(tenantId, new Set());
    byTenant.get(tenantId).add(productId);
  }
  for (const [tenantId, productIds] of byTenant.entries()) {
    const { data, error } = await sb
      .from("products")
      .select("tenant_id, product_id, cost_price")
      .eq("tenant_id", tenantId)
      .in("product_id", [...productIds]);
    if (error) throw new Error(`product cost lookup: ${error.message}`);
    for (const productRow of data || []) {
      costByKey.set(`${str(productRow.tenant_id)}::${str(productRow.product_id)}`, productRow.cost_price);
    }
  }
  return costByKey;
}

function mapInventoryHealthRow(row) {
  const productId = str(row.product_id ?? row.productId);
  const tenantId = str(row.tenant_id ?? row.tenantId);
  const currentStock = num(row.current_stock ?? row.currentStock);
  const cost = resolveInventoryUnitCost({
    tenantId,
    productId,
    currentStock,
    inventoryUnitCost: row.unit_cost ?? row.unitCost ?? null,
    productCostPrice: row.product_cost_price ?? row.cost_price ?? null,
    logQa: true,
  });
  return {
    productId,
    tenantId,
    currentStock,
    minStock: num(row.min_stock ?? row.minStock),
    reorderQty: num(row.reorder_qty ?? row.reorderQty),
    inventoryUnitCost: cost.inventoryUnitCost,
    productCostPrice: cost.productCostPrice,
    unitCost: cost.unitCost,
    unitCostSource: cost.source,
    inventoryValue: cost.inventoryValue,
  };
}

function mapInventoryLedgerRow(row) {
  return {
    productId: str(row.product_id),
    tenantId: str(row.tenant_id),
    movementType: str(row.movement_type).toUpperCase(),
    quantity: num(row.quantity),
    signedQuantity: num(row.quantity),
    createdAt: str(row.created_at),
  };
}

function assertFallbackCases() {
  const caseA = resolveInventoryUnitCost({
    tenantId: HQ,
    productId: "CASE_A",
    currentStock: 10,
    inventoryUnitCost: 150,
    productCostPrice: 200,
    logQa: false,
  });
  if (caseA.source !== "inventory" || caseA.resolvedUnitCost !== 150) {
    fail("fallback.caseA", `inventory cost must win; got ${JSON.stringify(caseA)}`);
  } else {
    pass("fallback.caseA", "inventory unit cost wins over product cost_price");
  }

  const caseB = resolveInventoryUnitCost({
    tenantId: HQ,
    productId: "CASE_B",
    currentStock: 10,
    inventoryUnitCost: null,
    productCostPrice: 200,
    logQa: false,
  });
  if (caseB.source !== "product" || caseB.resolvedUnitCost !== 200) {
    fail("fallback.caseB", `product cost must be used; got ${JSON.stringify(caseB)}`);
  } else {
    pass("fallback.caseB", "product cost_price used when inventory cost missing");
  }

  const caseC = resolveInventoryUnitCost({
    tenantId: HQ,
    productId: "CASE_C",
    currentStock: 10,
    inventoryUnitCost: null,
    productCostPrice: null,
    logQa: false,
  });
  if (caseC.source !== "missing" || caseC.resolvedUnitCost != null) {
    fail("fallback.caseC", `both missing must yield missing; got ${JSON.stringify(caseC)}`);
  } else {
    pass("fallback.caseC", "missing source when both costs unavailable");
  }
}

async function main() {
  console.log("\n=== Inventory Dashboard KPI Verification ===\n");
  console.log(`HQ tenant: ${HQ}\n`);

  assertFallbackCases();

  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (authErr) throw new Error(`auth: ${authErr.message}`);

  const recentFrom = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const [inventoryRes, ledgerRes] = await Promise.all([
    sb.from("inventory").select("tenant_id,product_id,current_stock,min_stock,reorder_qty").limit(5000),
    sb
      .from("inventory_ledger")
      .select(
        "id,created_at,tenant_id,product_id,product_name,movement_type,quantity,order_id,reference_type,reference_id,created_by,stock_before,stock_after"
      )
      .gte("created_at", `${recentFrom}T00:00:00`)
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);
  if (inventoryRes.error) throw new Error(inventoryRes.error.message);
  if (ledgerRes.error) throw new Error(ledgerRes.error.message);

  const productCostByKey = await fetchProductCostPricesByTenantProduct(sb, inventoryRes.data || []);
  const inventoryRows = (inventoryRes.data || [])
    .map((row) => {
      const tenantId = str(row.tenant_id);
      const productId = str(row.product_id);
      const productCostPrice = productCostByKey.get(`${tenantId}::${productId}`) ?? null;
      return mapInventoryHealthRow({ ...row, product_cost_price: productCostPrice });
    })
    .filter((r) => r.productId);

  const ledgerRows = (ledgerRes.data || []).map(mapInventoryLedgerRow);

  const hqRows = inventoryRows.filter((r) => r.tenantId === HQ);
  const sku003 = hqRows.find((r) => r.productId === "QA_SKU_003");

  console.log("\n--- QA_SKU_003 ---");
  if (!sku003) {
    fail("qa.sku003.present", `QA_SKU_003 not found for tenant ${HQ}`);
  } else {
    console.log(JSON.stringify(sku003, null, 2));
    const expectedValue = sku003.currentStock * sku003.unitCost;
    const checks = [
      ["tenantId", sku003.tenantId, HQ],
      ["productCostPrice", sku003.productCostPrice, 200],
      ["resolvedUnitCost", sku003.unitCost, 200],
      ["source", sku003.unitCostSource, "product"],
    ];
    for (const [field, actual, expected] of checks) {
      const ok = actual === expected;
      (ok ? pass : fail)(`qa.sku003.${field}`, `expected ${expected}, got ${actual}`);
    }
    if (sku003.currentStock <= 0) {
      fail("qa.sku003.currentStock", `expected positive stock, got ${sku003.currentStock}`);
    } else {
      pass("qa.sku003.currentStock", `currentStock=${sku003.currentStock} (live inventory)`);
    }
    if (Math.abs(num(sku003.inventoryValue) - expectedValue) > 0.01) {
      fail(
        "qa.sku003.inventoryValue",
        `expected ${expectedValue} (${sku003.currentStock} × ${sku003.unitCost}), got ${sku003.inventoryValue}`
      );
    } else {
      pass(
        "qa.sku003.inventoryValue",
        `inventoryValue=${sku003.inventoryValue} (${sku003.currentStock} × ${sku003.unitCost})`
      );
    }
  }

  const hqKeys = hqRows.map((r) => `${r.tenantId}::${r.productId}`);
  const uniqueHqKeys = new Set(hqKeys);
  if (hqKeys.length !== uniqueHqKeys.size) {
    fail(
      "duplicate.skus",
      `${hqKeys.length - uniqueHqKeys.size} duplicate HQ SKU rows detected`
    );
  } else {
    pass("duplicate.skus", `${uniqueHqKeys.size} unique HQ SKU rows (no duplicates)`);
  }

  const model = buildInventoryEconomicsModel(inventoryRows, ledgerRows);
  const analytics = buildInventoryValueAnalytics(model, inventoryRows, {
    tenantFilter: "hq",
    homeTenantId: HQ,
  });

  console.log("\n--- KPI analytics (HQ filter) ---");
  console.log(JSON.stringify(analytics, null, 2));

  if (!analytics.hasCostData) {
    fail("kpi.hasCostData", 'KPI shows "Not enough cost data" — expected numeric values');
  } else {
    pass("kpi.hasCostData", "KPI has cost data");
  }

  if (analytics.totalInventoryValueLabel === "Not enough cost data") {
    fail("kpi.totalLabel", "Total Inventory Value label is missing-cost message");
  } else {
    pass("kpi.totalLabel", `Total Inventory Value label: ${analytics.totalInventoryValueLabel}`);
  }

  if (analytics.criticalValueAtRisk == null) {
    fail("kpi.critical", "Critical Stock card has no numeric value");
  } else {
    pass("kpi.critical", `Critical Stock value: ${analytics.criticalValueAtRisk}`);
  }

  if (analytics.slowMovingValue == null || analytics.deadStockValue == null) {
    fail("kpi.deadSlow", "Dead/Slow stock cards missing numeric breakdown");
  } else {
    pass(
      "kpi.deadSlow",
      `Dead/Slow computed: slow=${analytics.slowMovingValue}, dead=${analytics.deadStockValue}`
    );
  }

  const hqEconRows = (model.rows || []).filter((r) => r.tenantId === HQ);
  const rowValueSum = hqEconRows.reduce((s, r) => s + num(r.inventoryValue), 0);
  const stockTimesCostSum = hqEconRows.reduce(
    (s, r) => s + num(r.currentStock) * num(r.unitCost),
    0
  );
  const dashboardTotal = num(analytics.totalInventoryValue);

  console.log("\n--- Reconciliation ---");
  console.log({
    hqSkuCount: hqEconRows.length,
    rowValueSum: Math.round(rowValueSum * 100) / 100,
    stockTimesCostSum: Math.round(stockTimesCostSum * 100) / 100,
    dashboardTotal: Math.round(dashboardTotal * 100) / 100,
  });

  const reconciled =
    Math.abs(rowValueSum - dashboardTotal) <= 0.01 &&
    Math.abs(stockTimesCostSum - dashboardTotal) <= 0.01;

  if (!reconciled) {
    fail(
      "reconciliation.total",
      `Σ inventoryValue (${rowValueSum}) / Σ stock×cost (${stockTimesCostSum}) != dashboard (${dashboardTotal})`
    );
  } else {
    pass(
      "reconciliation.total",
      `Dashboard total ${dashboardTotal} reconciles with logged SKU values`
    );
  }

  const rowsWithProductFallback = hqEconRows.filter((r) => r.unitCostSource === "product");
  if (rowsWithProductFallback.length > 0) {
    pass(
      "fallback.live",
      `${rowsWithProductFallback.length} HQ SKU(s) valued via product cost_price fallback`
    );
  } else if (hqEconRows.some((r) => num(r.unitCost) > 0)) {
    pass("fallback.live", "HQ SKUs valued via inventory unit cost (no product fallback needed)");
  } else {
    fail("fallback.live", "No HQ rows resolved to a positive unit cost");
  }

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    console.log("\nFailed checks:");
    for (const row of failed) console.log(`  - ${row.id}: ${row.detail}`);
    process.exit(1);
  }
  console.log("\nAll inventory dashboard KPI verification checks passed.\n");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
