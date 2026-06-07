import { loadMasterCatalog } from "@/catalog/masterCatalogData.js";
import {
  buildDistributorCatalogModel,
  catalogAssignedCount,
  isCatalogAssigned,
  mergeAssignedItems,
  readDistributorCatalogItems,
  removeDistributorCatalogItem,
  updateDistributorCatalogPricing,
} from "@/catalog/distributorCatalogEngine.js";
import { markProvisioningMilestone } from "@/distributor/distributorProvisioningData.js";
import {
  fetchDatabaseTenantById,
  PERSISTENCE_STATUS,
  patchDurableTenantMetadata,
  verifyDistributorCatalogMetadata,
} from "@/tenant/durableTenantStore.js";
import {
  buildCatalogInventoryMirrorStatus,
  recordCatalogSyncAttempt,
} from "@/catalog/catalogMirrorDiagnostics.js";
import { parseSyncLayersFromResult } from "@/catalog/catalogMirrorHealth.js";
import { getRegistryTenant, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";
import { supabase } from "@/api/supabaseClient.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

function isDurableScopeRow(row = null) {
  return Boolean(row?.durable || row?.source === "database");
}

function enrichRegistryRowFromScope(fromRegistry, distributorRow) {
  const fallbackId = str(distributorRow?.id ?? distributorRow?.tenantId);
  if (!distributorRow || fallbackId !== str(fromRegistry?.id)) return fromRegistry;
  if (!isDurableScopeRow(distributorRow)) return fromRegistry;

  const enriched = {
    ...fromRegistry,
    durable: true,
    source: "database",
    persistenceStatus:
      distributorRow.persistenceStatus ||
      fromRegistry.persistenceStatus ||
      PERSISTENCE_STATUS.DURABLE,
    tenantCode: fromRegistry.tenantCode || distributorRow.tenantCode,
    name: fromRegistry.name || distributorRow.name,
    config: { ...(distributorRow.config || {}), ...(fromRegistry.config || {}) },
    provisioning: { ...(fromRegistry.provisioning || {}), ...(distributorRow.provisioning || {}) },
  };
  upsertRegistryTenant(enriched);
  return getRegistryTenant(enriched.id) || enriched;
}

/**
 * Resolve distributor tenant from Distributor OS scope — never infer from global HQ view.
 */
export async function resolveDistributorRow(tenantId, distributorRow = null) {
  const id = str(tenantId);
  if (!id) return null;

  const fromRegistry = getRegistryTenant(id);
  if (fromRegistry) {
    return enrichRegistryRowFromScope(fromRegistry, distributorRow);
  }

  const fallback = distributorRow || null;
  const fallbackId = str(fallback?.id ?? fallback?.tenantId);
  if (!fallback || fallbackId !== id) {
    const db = await fetchDatabaseTenantById(id);
    if (!db.row) return null;
    const normalized = {
      id,
      tenantId: id,
      name: db.row.tenant_name || "Distributor",
      status: db.row.status || "PENDING",
      tenantCode: db.row.tenant_code,
      config: db.row.metadata?.config || {},
      provisioning: db.row.metadata?.provisioning || {},
      metrics: db.row.metadata?.metrics || {},
      source: "database",
      durable: true,
      persistenceStatus: PERSISTENCE_STATUS.DURABLE,
    };
    upsertRegistryTenant(normalized);
    return getRegistryTenant(id) || normalized;
  }

  const normalized = {
    id: fallbackId,
    tenantId: fallbackId,
    name: fallback.name || fallback.config?.companyName || "Distributor",
    status: fallback.status || "PENDING",
    tenantCode: fallback.tenantCode,
    config: { ...(fallback.config || {}) },
    provisioning: { ...(fallback.provisioning || {}) },
    metrics: { ...(fallback.metrics || {}) },
    source: fallback.source || (fallback.durable ? "database" : "registry"),
    durable: Boolean(fallback.durable || fallback.source === "database"),
    persistenceStatus: fallback.persistenceStatus,
    persistenceLabel: fallback.persistenceLabel,
    lastIsolationPass: fallback.lastIsolationPass,
    isolationChecks: fallback.isolationChecks,
    isHome: Boolean(fallback.isHome),
  };

  upsertRegistryTenant(normalized);
  return getRegistryTenant(id) || normalized;
}

/**
 * Idempotent mirror: upsert distributor-scoped products + inventory rows.
 * Inventory table has no product_name column — only product_id + stock fields.
 */
export async function syncDistributorCatalogToSupabase(distributorTenantId, items = []) {
  const tenantId = str(distributorTenantId);
  if (!supabase || !tenantId || !items.length) {
    return {
      ok: false,
      synced: 0,
      productsSynced: 0,
      inventorySynced: 0,
      skipped: !supabase,
      reason: !supabase ? "supabase_not_configured" : "no_items",
      results: [],
    };
  }

  const results = [];
  for (const item of items) {
    const productId = str(item.productId);
    if (!productId) continue;

    const productPayload = {
      tenant_id: tenantId,
      product_id: productId,
      product_name: str(item.productName) || productId,
      category: str(item.category) || "Consumables",
      selling_price: num(item.sellingPrice),
      cost_price: num(item.costPrice),
      active: item.active !== false,
    };
    const invPayload = {
      tenant_id: tenantId,
      product_id: productId,
      current_stock: num(item.currentStock),
      min_stock: num(item.minStock),
      reorder_qty: num(item.reorderQty ?? item.reorder_qty),
    };

    const prod = await supabase.from("products").upsert(productPayload, {
      onConflict: "tenant_id,product_id",
    });
    const inv = await supabase.from("inventory").upsert(invPayload, {
      onConflict: "tenant_id,product_id",
    });

    results.push({
      productId,
      productName: str(item.productName) || productId,
      productOk: !prod.error,
      inventoryOk: !inv.error,
      productError: prod.error?.message || null,
      inventoryError: inv.error?.message || null,
    });
  }

  const productsSynced = results.filter((row) => row.productOk).length;
  const inventorySynced = results.filter((row) => row.inventoryOk).length;
  const productError = results.find((row) => row.productError)?.productError || null;
  const inventoryError = results.find((row) => row.inventoryError)?.inventoryError || null;

  return {
    ok: productsSynced === results.length && inventorySynced === results.length && results.length > 0,
    synced: productsSynced,
    productsSynced,
    inventorySynced,
    productError,
    inventoryError,
    results,
  };
}

async function recordMirrorAttempt(tenantId, items, syncResult) {
  const mirrorStatus = await buildCatalogInventoryMirrorStatus(tenantId, items);
  const layers = parseSyncLayersFromResult({ ok: syncResult?.ok, supabaseSync: syncResult });
  recordCatalogSyncAttempt(tenantId, {
    result: { ok: syncResult?.ok, supabaseSync: syncResult },
    layers,
    status: mirrorStatus.status === "PASS" ? "Synced" : "Sync Failed",
    catalogItemsCount: mirrorStatus.catalogCount,
    mirroredProductsCount: mirrorStatus.productsCount,
    mirroredInventoryCount: mirrorStatus.inventoryCount,
    action: "mirror",
  });
  return mirrorStatus;
}

/** Re-run product + inventory mirror for all assigned catalog SKUs (idempotent). */
export async function resyncDistributorCatalogMirror(distributorTenantId, options = {}) {
  const id = str(distributorTenantId);
  if (!id) return { ok: false, error: "Missing distributor tenant id" };

  const row = await resolveDistributorRow(id, options.distributorRow);
  if (!row) return { ok: false, error: "Distributor not found" };

  const items = readDistributorCatalogItems(row.config || {});
  if (!items.length) {
    return { ok: false, error: "No assigned catalog items to mirror", items: [] };
  }

  const sync = await syncDistributorCatalogToSupabase(id, items);
  const catalogInventoryMirrorStatus = await recordMirrorAttempt(id, items, sync);

  return {
    ok: sync.ok && catalogInventoryMirrorStatus.status === "PASS",
    items,
    supabaseSync: sync,
    catalogInventoryMirrorStatus,
    row: getRegistryTenant(id),
    error: sync.ok ? null : sync.inventoryError || sync.productError || "Catalog mirror incomplete",
  };
}

function buildConfigPatch(row, items) {
  const now = new Date().toISOString();
  const assigned = items.length > 0;
  return {
    ...(row.config || {}),
    catalogAssigned: assigned,
    catalogAssignedAt: assigned ? row.config?.catalogAssignedAt || now : null,
    catalogAssignedCount: items.length,
    productCatalogReady: assigned,
    standardCatalogEnabled: assigned,
    catalogConfiguredAt: assigned ? row.config?.catalogConfiguredAt || now : null,
    distributorCatalog: { items, updatedAt: now },
  };
}

function persistDistributorCatalogLocal(row, config, tenantId) {
  const now = new Date().toISOString();
  const updated = {
    ...row,
    id: tenantId,
    tenantId,
    config,
    durable: row.durable || row.source === "database",
    source: row.source === "database" || row.durable ? "database" : row.source || "registry",
    updatedAt: now,
  };
  upsertRegistryTenant(updated);
  return updated;
}

/**
 * Patch public.tenants.metadata.config for durable distributors; verify persistence.
 */
async function persistDistributorCatalogMetadata(tenantId, row, config) {
  if (!supabase) {
    return { ok: true, skipped: true, reason: "supabase_not_configured" };
  }

  const db = await fetchDatabaseTenantById(tenantId);
  if (!db.row) {
    return { ok: true, skipped: true, reason: "tenant_not_in_supabase" };
  }

  const provisioning = row.provisioning || {};
  const patch = await patchDurableTenantMetadata(tenantId, { config, provisioning });
  if (!patch.ok) {
    return {
      ok: false,
      skipped: false,
      error: patch.error || "Failed to save catalog metadata to Supabase",
      supabasePersisted: false,
    };
  }

  const assigned = isCatalogAssigned(config);
  const verify = await verifyDistributorCatalogMetadata(tenantId, {
    minCount: assigned ? catalogAssignedCount(config) : 0,
    requireAssigned: assigned,
  });
  if (!verify.ok) {
    return {
      ok: false,
      skipped: false,
      error:
        verify.error ||
        "Catalog metadata was not confirmed in Supabase after save — check RLS or metadata column",
      supabasePersisted: false,
      verify,
    };
  }

  const fresh = getRegistryTenant(tenantId) || { ...row, config };
  upsertRegistryTenant({
    ...fresh,
    config: patch.metadata?.config || config,
    provisioning: patch.metadata?.provisioning || provisioning,
    syncFailed: false,
    lastSyncError: null,
    durable: true,
    source: "database",
    persistenceStatus: PERSISTENCE_STATUS.DURABLE,
  });

  return {
    ok: true,
    skipped: false,
    supabasePersisted: true,
    metadata: patch.metadata,
    verify,
  };
}

export async function loadDistributorCatalogBundle(
  distributorTenantId,
  homeTenantId,
  options = {}
) {
  const id = str(distributorTenantId);
  const home = str(homeTenantId);
  const row = await resolveDistributorRow(id, options.distributorRow);

  const [master] = await Promise.all([loadMasterCatalog()]);

  const assignedItems = readDistributorCatalogItems(row?.config || {});
  const model = buildDistributorCatalogModel({
    masterItems: master.items || [],
    assignedItems,
    distributorTenantId: id,
    homeTenantId: home,
  });

  return { master, registryRow: row, distributorRow: row, ...model };
}

export async function assignMasterProductsToDistributor(
  distributorTenantId,
  productIds = [],
  options = {}
) {
  const id = str(distributorTenantId);
  if (!id) return { ok: false, error: "Missing distributor tenant id" };

  const row = await resolveDistributorRow(id, options.distributorRow || options.fallbackTenant);
  if (!row) {
    return { ok: false, error: "Distributor not found — select a distributor in Distributor OS" };
  }

  const master = await loadMasterCatalog();
  const masterMap = new Map((master.items || []).map((p) => [str(p.productId), p]));
  const toAdd = (productIds.length ? productIds : [...masterMap.keys()])
    .map((pid) => masterMap.get(str(pid)))
    .filter(Boolean);

  if (!toAdd.length) {
    return { ok: false, error: "No HQ master products available to assign" };
  }

  const existing = readDistributorCatalogItems(row.config || {});
  const items = mergeAssignedItems(existing, toAdd, id);
  const config = buildConfigPatch(row, items);

  persistDistributorCatalogLocal(row, config, id);
  markProvisioningMilestone(id, "catalog_configured");

  const metadataResult = await persistDistributorCatalogMetadata(id, row, config);
  if (!metadataResult.ok) {
    return {
      ok: false,
      error: metadataResult.error,
      assignedCount: catalogAssignedCount(config),
      items,
      config,
      localOnly: true,
      supabasePersisted: false,
      row: getRegistryTenant(id),
    };
  }

  const sync = await syncDistributorCatalogToSupabase(id, items);
  const catalogInventoryMirrorStatus = await recordMirrorAttempt(id, items, sync);
  const localOk = isCatalogAssigned(config);
  const metadataOk = metadataResult.skipped || metadataResult.ok;
  const mirrorOk = sync.ok && catalogInventoryMirrorStatus.status === "PASS";

  return {
    ok: localOk && metadataOk && mirrorOk,
    assignedCount: catalogAssignedCount(config),
    items,
    config,
    durablePatchOk: metadataResult.ok && !metadataResult.skipped,
    supabasePersisted: metadataResult.supabasePersisted === true,
    supabaseSkipped: metadataResult.skipped === true,
    supabaseVerify: metadataResult.verify || null,
    supabaseSync: sync,
    catalogInventoryMirrorStatus,
    row: getRegistryTenant(id),
    error: !localOk
      ? "Catalog assignment incomplete"
      : !metadataOk
        ? metadataResult.error || "Catalog metadata not persisted"
        : !mirrorOk
          ? sync.inventoryError ||
            sync.productError ||
            "Product/inventory mirror incomplete — check Supabase RLS"
          : null,
  };
}

export async function updateDistributorCatalogItem(
  distributorTenantId,
  productId,
  patch = {},
  options = {}
) {
  const id = str(distributorTenantId);
  const row = await resolveDistributorRow(id, options.distributorRow);
  if (!row) return { ok: false, error: "Distributor not found" };

  const items = updateDistributorCatalogPricing(readDistributorCatalogItems(row.config), productId, patch);
  const config = buildConfigPatch(row, items);
  persistDistributorCatalogLocal(row, config, id);

  const metadataResult = await persistDistributorCatalogMetadata(id, row, config);
  if (!metadataResult.ok) {
    return { ok: false, error: metadataResult.error, items, config, localOnly: true };
  }

  const savedItems = items.filter((i) => str(i.productId) === str(productId));
  const supabaseSync = await syncDistributorCatalogToSupabase(id, savedItems);
  const catalogInventoryMirrorStatus = await recordMirrorAttempt(id, items, supabaseSync);
  const mirrorOk = supabaseSync.ok && catalogInventoryMirrorStatus.status === "PASS";

  return {
    ok: mirrorOk,
    items,
    config,
    savedItem: savedItems[0] || null,
    supabasePersisted: metadataResult.supabasePersisted === true,
    supabaseSync,
    catalogInventoryMirrorStatus,
    row: getRegistryTenant(id),
    error: mirrorOk
      ? null
      : supabaseSync.inventoryError ||
        supabaseSync.productError ||
        "Product/inventory mirror incomplete",
  };
}

export async function unassignDistributorCatalogProduct(
  distributorTenantId,
  productId,
  options = {}
) {
  const id = str(distributorTenantId);
  const row = await resolveDistributorRow(id, options.distributorRow);
  if (!row) return { ok: false, error: "Distributor not found" };

  const items = removeDistributorCatalogItem(readDistributorCatalogItems(row.config), productId);
  const config = buildConfigPatch(row, items);
  persistDistributorCatalogLocal(row, config, id);

  const metadataResult = await persistDistributorCatalogMetadata(id, row, config);
  if (!metadataResult.ok) {
    return {
      ok: false,
      error: metadataResult.error,
      assignedCount: items.length,
      catalogAssigned: isCatalogAssigned(config),
      localOnly: true,
    };
  }

  return {
    ok: true,
    assignedCount: items.length,
    catalogAssigned: isCatalogAssigned(config),
    supabasePersisted: metadataResult.supabasePersisted === true,
    row: getRegistryTenant(id),
  };
}

/** Quick-assign all HQ master products (replaces legacy standard catalog enable). */
export async function assignAllMasterCatalogToDistributor(tenantId, options = {}) {
  return assignMasterProductsToDistributor(tenantId, [], options);
}
