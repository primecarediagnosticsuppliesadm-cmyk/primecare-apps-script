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
    const diagnostics = await loadCatalogMirrorDiagnostics(id, items);
    rows.push({
      distributorId: id,
      name: distributor.name || id,
      catalogItemsCount: diagnostics.catalogItemsCount,
      status: diagnostics.status,
      layers: diagnostics.layers,
      mirroredProductsCount: diagnostics.mirroredProductsCount,
      mirroredInventoryCount: diagnostics.mirroredInventoryCount,
      lastSyncAttemptAt: diagnostics.lastSyncAttemptAt,
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
