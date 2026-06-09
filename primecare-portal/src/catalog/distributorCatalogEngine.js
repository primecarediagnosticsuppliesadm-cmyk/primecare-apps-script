/**
 * Distributor catalog — assignment from HQ master, distributor pricing & inventory.
 */

import {
  computeDistributorMargin,
  isHqPricingConfigured,
  isPositivePrice,
  mapMasterCatalogRow,
} from "@/catalog/masterCatalogEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function readHqTransferPrice(item = {}) {
  return num(
    item.hqTransferPrice ??
      item.transferPrice ??
      item.hqTransfer ??
      item.unitTransferPrice
  );
}

function readHqCostPrice(item = {}) {
  return num(item.hqCostPrice ?? item.costPrice ?? item.unitCost);
}

function enrichCatalogItemMargins(item = {}) {
  const hqCostPrice = readHqCostPrice(item);
  const hqTransferPrice = readHqTransferPrice(item);
  const sellingPrice = num(item.sellingPrice ?? item.unitSellingPrice);
  const hqPricingConfigured = isHqPricingConfigured(hqCostPrice, hqTransferPrice);
  const margin = computeDistributorMargin(sellingPrice, hqTransferPrice);

  return {
    ...item,
    hqCostPrice,
    hqTransferPrice,
    hqPricingConfigured,
    sellingPrice,
    marginAmount: margin.marginAmount,
    marginPct: margin.marginPct,
    marginConfigured: margin.configured && hqPricingConfigured,
  };
}

export function readDistributorCatalogItems(config = {}) {
  const catalog = config.distributorCatalog || {};
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  return items.map(normalizeDistributorCatalogItem).filter((i) => i.productId);
}

export function normalizeDistributorCatalogItem(item = {}) {
  const base = {
    productId: str(item.productId),
    productName: str(item.productName) || str(item.productId),
    category: str(item.category) || "Consumables",
    brand: str(item.brand) || "PrimeCare",
    hqSellingPrice: num(item.hqSellingPrice ?? item.sellingPrice),
    hqCostPrice: readHqCostPrice(item),
    hqTransferPrice: readHqTransferPrice(item),
    sellingPrice: num(item.sellingPrice ?? item.unitSellingPrice),
    costPrice: readHqCostPrice(item),
    currentStock: num(item.currentStock),
    minStock: num(item.minStock),
    active: item.active !== false,
    assignedAt: item.assignedAt || null,
    tenantId: str(item.tenantId),
  };
  return enrichCatalogItemMargins(base);
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
  const item = {
    productId: base.productId,
    productName: base.productName,
    category: base.category,
    brand: base.brand,
    hqSellingPrice: base.sellingPrice,
    hqCostPrice: base.costPrice,
    hqTransferPrice: base.transferPrice,
    sellingPrice,
    costPrice: base.costPrice,
    currentStock: num(overrides.currentStock ?? 0),
    minStock: num(overrides.minStock ?? base.minStock),
    active: base.active,
    assignedAt: new Date().toISOString(),
    tenantId: str(distributorTenantId),
  };
  return enrichCatalogItemMargins(item);
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
    return enrichCatalogItemMargins({
      ...item,
      sellingPrice,
      currentStock: patch.currentStock != null ? num(patch.currentStock) : item.currentStock,
      minStock: patch.minStock != null ? num(patch.minStock) : item.minStock,
    });
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
    const normalized = normalizeDistributorCatalogItem(item);
    if (!isPositivePrice(normalized.sellingPrice)) {
      issues.push(`${normalized.productName || normalized.productId}: distributor selling price must be > 0`);
    }
  }
  return { valid: issues.length === 0, invalidCount: issues.length, issues };
}

export function validateHqCatalogPricingConfigured(items = []) {
  if (!items.length) {
    return {
      valid: false,
      invalidCount: 0,
      issues: ["No products assigned"],
      missingCount: 0,
      missingSkus: [],
    };
  }
  const issues = [];
  const missingSkus = [];
  for (const item of items) {
    const normalized = normalizeDistributorCatalogItem(item);
    if (!normalized.hqPricingConfigured) {
      issues.push(
        `${normalized.productName || normalized.productId}: HQ cost/transfer price not configured`
      );
      missingSkus.push({
        sku: normalized.productId || normalized.productName,
        hqCost: normalized.hqCostPrice,
        transferPrice: normalized.hqTransferPrice,
        sellingPrice: normalized.sellingPrice,
      });
    }
  }
  return {
    valid: issues.length === 0,
    invalidCount: issues.length,
    missingCount: issues.length,
    issues,
    missingSkus,
  };
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

export function buildDistributorCatalogModel({
  masterItems = [],
  assignedItems = [],
  distributorTenantId,
  homeTenantId,
} = {}) {
  const normalizedAssigned = assignedItems.map(normalizeDistributorCatalogItem);
  const assignedIds = new Set(normalizedAssigned.map((i) => str(i.productId)));
  const available = masterItems.filter((m) => !assignedIds.has(str(m.productId)));
  const pricing = validateDistributorCatalogPricing(normalizedAssigned);
  const hqPricing = validateHqCatalogPricingConfigured(normalizedAssigned);
  const isolation = validateDistributorInventoryIsolation(
    normalizedAssigned,
    distributorTenantId,
    homeTenantId
  );

  return {
    distributorTenantId,
    homeTenantId,
    assignedItems: normalizedAssigned,
    availableItems: available,
    assignedCount: normalizedAssigned.length,
    masterCount: masterItems.length,
    catalogAssigned: normalizedAssigned.length > 0,
    pricingValid: pricing.valid && hqPricing.valid,
    pricingIssues: [...pricing.issues, ...hqPricing.issues],
    hqPricingValid: hqPricing.valid,
    hqPricingIssues: hqPricing.issues,
    hqPricingMissingCount: hqPricing.missingCount,
    inventoryIsolated: isolation.isolated,
    hqLeakCount: isolation.hqLeakCount,
  };
}
