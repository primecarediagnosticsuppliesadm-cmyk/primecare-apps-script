import { supabase } from "@/api/supabaseClient.js";
import { readDistributorCatalogItems } from "@/catalog/distributorCatalogEngine.js";
import {
  buildCatalogMirrorHealth,
  CATALOG_SYNC_STATUS,
  parseSyncLayersFromResult,
} from "@/catalog/catalogMirrorHealth.js";

const SYNC_ATTEMPT_KEY = "primecare_catalog_mirror_sync_v1";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function readJson(key, fallback) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function readAllSyncAttempts() {
  return readJson(SYNC_ATTEMPT_KEY, {});
}

/**
 * @param {string} tenantId
 * @param {object} attempt
 */
export function recordCatalogSyncAttempt(tenantId, attempt = {}) {
  const id = str(tenantId);
  if (!id) return null;
  const all = readAllSyncAttempts();
  const layers = attempt.layers || parseSyncLayersFromResult(attempt.result || {});
  const health = buildCatalogMirrorHealth({
    catalogItemsCount: num(attempt.catalogItemsCount),
    mirroredProductsCount: attempt.mirroredProductsCount ?? null,
    mirroredInventoryCount: attempt.mirroredInventoryCount ?? null,
    lastAttempt: {
      at: new Date().toISOString(),
      status: attempt.status,
      layers,
      productId: attempt.productId || null,
      action: attempt.action || "save",
    },
  });
  const entry = {
    at: new Date().toISOString(),
    status: attempt.status || health.status,
    layers,
    productId: attempt.productId || null,
    action: attempt.action || "save",
    catalogItemsCount: num(attempt.catalogItemsCount),
    mirroredProductsCount: attempt.mirroredProductsCount ?? null,
    mirroredInventoryCount: attempt.mirroredInventoryCount ?? null,
    syncStatusConsistent: health.syncStatusConsistent,
    error: attempt.error || null,
  };
  all[id] = entry;
  writeJson(SYNC_ATTEMPT_KEY, all);
  return entry;
}

export function loadLastCatalogSyncAttempt(tenantId) {
  const id = str(tenantId);
  if (!id) return null;
  return readAllSyncAttempts()[id] || null;
}

function catalogSkuRow(item = {}) {
  return {
    productId: str(item.productId),
    productName: str(item.productName) || str(item.productId),
  };
}

/**
 * Per-SKU catalog → products → inventory mirror diagnostics.
 * @param {string} tenantId
 * @param {object[]} [assignedItems]
 */
export async function buildCatalogInventoryMirrorStatus(tenantId, assignedItems = []) {
  const id = str(tenantId);
  const items = (assignedItems || []).map(catalogSkuRow).filter((row) => row.productId);
  const catalogCount = items.length;
  const empty = {
    status: catalogCount > 0 ? "FAIL" : "PASS",
    catalogCount,
    productsCount: 0,
    inventoryCount: 0,
    missingProducts: items,
    missingInventory: items,
    skuFailures: items.map((row) => ({
      sku: row.productId,
      productName: row.productName,
      reason: "missing_product_and_inventory",
    })),
    readError: null,
  };

  if (!id || !catalogCount) return empty;
  if (!supabase) {
    return { ...empty, readError: "Supabase not configured", skipped: true };
  }

  const productIds = items.map((row) => row.productId);
  try {
    const [prodRes, invRes] = await Promise.all([
      supabase.from("products").select("product_id").eq("tenant_id", id).in("product_id", productIds),
      supabase.from("inventory").select("product_id").eq("tenant_id", id).in("product_id", productIds),
    ]);

    const readError = prodRes.error?.message || invRes.error?.message || null;
    const productSet = new Set((prodRes.data || []).map((row) => str(row.product_id)));
    const inventorySet = new Set((invRes.data || []).map((row) => str(row.product_id)));

    const missingProducts = items.filter((row) => !productSet.has(row.productId));
    const missingInventory = items.filter(
      (row) => productSet.has(row.productId) && !inventorySet.has(row.productId)
    );
    const skuFailures = [
      ...missingProducts.map((row) => ({
        sku: row.productId,
        productName: row.productName,
        reason: "missing_product_row",
      })),
      ...missingInventory.map((row) => ({
        sku: row.productId,
        productName: row.productName,
        reason: "missing_inventory_row",
      })),
    ];

    const aligned = missingProducts.length === 0 && missingInventory.length === 0;
    return {
      status: aligned ? "PASS" : "FAIL",
      catalogCount,
      productsCount: productSet.size,
      inventoryCount: inventorySet.size,
      missingProducts,
      missingInventory,
      skuFailures,
      readError,
      probeAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ...empty,
      readError: err?.message || "Mirror status probe failed",
    };
  }
}

/**
 * Read-only probe of mirrored row counts (RLS may hide distributor rows).
 * @param {string} tenantId
 * @param {string[]} productIds
 */
export async function probeCatalogMirrorCounts(tenantId, productIds = []) {
  const id = str(tenantId);
  const ids = [...new Set(productIds.map((pid) => str(pid)).filter(Boolean))];
  if (!id) {
    return {
      ok: false,
      productsCount: 0,
      inventoryCount: 0,
      readError: "Missing distributor tenant id",
    };
  }
  if (!supabase) {
    return {
      ok: false,
      productsCount: 0,
      inventoryCount: 0,
      readError: "Supabase not configured",
      skipped: true,
    };
  }
  if (!ids.length) {
    return { ok: true, productsCount: 0, inventoryCount: 0, readError: null };
  }

  try {
    const [prodRes, invRes] = await Promise.all([
      supabase
        .from("products")
        .select("product_id", { count: "exact", head: true })
        .eq("tenant_id", id)
        .in("product_id", ids),
      supabase
        .from("inventory")
        .select("product_id", { count: "exact", head: true })
        .eq("tenant_id", id)
        .in("product_id", ids),
    ]);

    const readError = prodRes.error?.message || invRes.error?.message || null;
    return {
      ok: !readError,
      productsCount: num(prodRes.count),
      inventoryCount: num(invRes.count),
      readError,
      probeAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      productsCount: 0,
      inventoryCount: 0,
      readError: err?.message || "Mirror probe failed",
    };
  }
}

/**
 * @param {string} tenantId
 * @param {object[]} [assignedItems]
 * @param {{ diagnosticsLoading?: boolean }} [options]
 */
export async function loadCatalogMirrorDiagnostics(tenantId, assignedItems = [], options = {}) {
  const items = assignedItems.length
    ? assignedItems
    : [];
  const productIds = items.map((i) => str(i.productId)).filter(Boolean);
  const catalogItemsCount = items.length;
  const lastAttempt = loadLastCatalogSyncAttempt(tenantId);

  if (options.diagnosticsLoading) {
    return {
      ...buildCatalogMirrorHealth({
        catalogItemsCount,
        lastAttempt,
        diagnosticsLoading: true,
      }),
      lastAttempt,
      probe: null,
    };
  }

  const probe = await probeCatalogMirrorCounts(tenantId, productIds);
  const health = buildCatalogMirrorHealth({
    catalogItemsCount,
    mirroredProductsCount: probe.productsCount,
    mirroredInventoryCount: probe.inventoryCount,
    lastAttempt,
  });

  return {
    ...health,
    lastAttempt,
    probe,
  };
}

/**
 * Portfolio-level mirror summary for Founder FI.
 * @param {object[]} distributors
 */
export async function buildPortfolioCatalogMirrorSummary(distributors = []) {
  const rows = [];
  for (const distributor of distributors) {
    const id = str(distributor.id);
    const items = readDistributorCatalogItems(distributor.config || {});
    if (!items.length) continue;
    const [diagnostics, catalogInventoryMirrorStatus] = await Promise.all([
      loadCatalogMirrorDiagnostics(id, items),
      buildCatalogInventoryMirrorStatus(id, items),
    ]);
    rows.push({
      distributorId: id,
      name: distributor.name || id,
      catalogItemsCount: diagnostics.catalogItemsCount,
      status: diagnostics.status,
      layers: diagnostics.layers,
      mirroredProductsCount: diagnostics.mirroredProductsCount,
      mirroredInventoryCount: diagnostics.mirroredInventoryCount,
      lastSyncAttemptAt: diagnostics.lastSyncAttemptAt,
      catalogInventoryMirrorStatus,
    });
  }

  const anyMetadataOnly = rows.some((r) => r.status !== CATALOG_SYNC_STATUS.SYNCED);
  const metadataOnlyDistributors = rows
    .filter((r) => r.status === CATALOG_SYNC_STATUS.METADATA_ONLY)
    .map((r) => r.name);
  const syncFailedDistributors = rows
    .filter((r) => r.status === CATALOG_SYNC_STATUS.SYNC_FAILED)
    .map((r) => r.name);

  return {
    rows,
    distributorCount: rows.length,
    anyMetadataOnly,
    anyNotFullySynced: anyMetadataOnly,
    metadataOnlyDistributors,
    syncFailedDistributors,
    fullySyncedCount: rows.filter((r) => r.status === CATALOG_SYNC_STATUS.SYNCED).length,
  };
}
