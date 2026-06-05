/**
 * Distributor catalog — assignment from HQ master, distributor pricing & inventory.
 */

import { computeMarginPct, mapMasterCatalogRow } from "@/catalog/masterCatalogEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function readDistributorCatalogItems(config = {}) {
  const catalog = config.distributorCatalog || {};
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  return items.map(normalizeDistributorCatalogItem).filter((i) => i.productId);
}

export function normalizeDistributorCatalogItem(item = {}) {
  const sellingPrice = num(item.sellingPrice ?? item.unitSellingPrice);
  const costPrice = num(item.costPrice ?? item.unitCost ?? item.hqCostPrice);
  return {
    productId: str(item.productId),
    productName: str(item.productName) || str(item.productId),
    category: str(item.category) || "Consumables",
    brand: str(item.brand) || "PrimeCare",
    hqSellingPrice: num(item.hqSellingPrice ?? sellingPrice),
    hqCostPrice: num(item.hqCostPrice ?? costPrice),
    sellingPrice,
    costPrice,
    marginPct: num(item.marginPct) || computeMarginPct(sellingPrice, costPrice),
    currentStock: num(item.currentStock),
    minStock: num(item.minStock),
    active: item.active !== false,
    assignedAt: item.assignedAt || null,
    tenantId: str(item.tenantId),
  };
}

export function isCatalogAssigned(config = {}) {
  const items = readDistributorCatalogItems(config);
  return Boolean(config.catalogAssigned) && items.length > 0;
}

export function catalogAssignedCount(config = {}) {
  return readDistributorCatalogItems(config).length;
}

export function buildDistributorCatalogItemFromMaster(masterRow, distributorTenantId, overrides = {}) {
  const base = mapMasterCatalogRow(masterRow);
  const sellingPrice = num(overrides.sellingPrice ?? base.sellingPrice);
  const costPrice = num(overrides.costPrice ?? base.costPrice);
  return {
    productId: base.productId,
    productName: base.productName,
    category: base.category,
    brand: base.brand,
    hqSellingPrice: base.sellingPrice,
    hqCostPrice: base.costPrice,
    sellingPrice,
    costPrice,
    marginPct: computeMarginPct(sellingPrice, costPrice),
    currentStock: num(overrides.currentStock ?? 0),
    minStock: num(overrides.minStock ?? base.minStock),
    active: base.active,
    assignedAt: new Date().toISOString(),
    tenantId: str(distributorTenantId),
  };
}

export function mergeAssignedItems(existing = [], toAdd = [], distributorTenantId) {
  const map = new Map(existing.map((i) => [str(i.productId), normalizeDistributorCatalogItem(i)]));
  for (const row of toAdd) {
    const item = buildDistributorCatalogItemFromMaster(row, distributorTenantId);
    map.set(item.productId, item);
  }
  return [...map.values()];
}

export function updateDistributorCatalogPricing(items = [], productId, patch = {}) {
  const id = str(productId);
  return items.map((item) => {
    if (str(item.productId) !== id) return item;
    const sellingPrice = num(patch.sellingPrice ?? item.sellingPrice);
    const costPrice = num(patch.costPrice ?? item.costPrice);
    return {
      ...item,
      sellingPrice,
      costPrice,
      marginPct: computeMarginPct(sellingPrice, costPrice),
      currentStock: patch.currentStock != null ? num(patch.currentStock) : item.currentStock,
      minStock: patch.minStock != null ? num(patch.minStock) : item.minStock,
    };
  });
}

export function removeDistributorCatalogItem(items = [], productId) {
  const id = str(productId);
  return items.filter((i) => str(i.productId) !== id);
}

export function validateDistributorCatalogPricing(items = []) {
  if (!items.length) return { valid: false, invalidCount: 0, issues: ["No products assigned"] };
  const issues = [];
  for (const item of items) {
    if (num(item.sellingPrice) <= 0) {
      issues.push(`${item.productName || item.productId}: selling price must be > 0`);
    }
    if (num(item.costPrice) < 0) {
      issues.push(`${item.productName || item.productId}: cost price invalid`);
    }
  }
  return { valid: issues.length === 0, invalidCount: issues.length, issues };
}

export function validateDistributorInventoryIsolation(items = [], distributorTenantId, homeTenantId) {
  const dist = str(distributorTenantId);
  const home = str(homeTenantId);
  if (!dist || !home || dist === home) {
    return { isolated: false, hqLeakCount: items.length, issues: ["Invalid distributor scope"] };
  }
  const leaks = items.filter((i) => str(i.tenantId) === home || !str(i.tenantId));
  return {
    isolated: leaks.length === 0 && items.every((i) => str(i.tenantId) === dist),
    hqLeakCount: leaks.length,
    issues: leaks.map((i) => `${i.productId} not scoped to distributor tenant`),
  };
}

export function buildDistributorCatalogModel({ masterItems = [], assignedItems = [], distributorTenantId, homeTenantId } = {}) {
  const assignedIds = new Set(assignedItems.map((i) => str(i.productId)));
  const available = masterItems.filter((m) => !assignedIds.has(str(m.productId)));
  const pricing = validateDistributorCatalogPricing(assignedItems);
  const isolation = validateDistributorInventoryIsolation(assignedItems, distributorTenantId, homeTenantId);

  return {
    distributorTenantId,
    homeTenantId,
    assignedItems,
    availableItems: available,
    assignedCount: assignedItems.length,
    masterCount: masterItems.length,
    catalogAssigned: assignedItems.length > 0,
    pricingValid: pricing.valid,
    pricingIssues: pricing.issues,
    inventoryIsolated: isolation.isolated,
    hqLeakCount: isolation.hqLeakCount,
  };
}
