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
import { getRegistryTenant, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";
import { supabase } from "@/api/supabaseClient.js";

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

async function syncDistributorCatalogToSupabase(distributorTenantId, items = []) {
  if (!supabase || !distributorTenantId || !items.length) return { ok: false, synced: 0 };

  let synced = 0;
  for (const item of items) {
    const productPayload = {
      tenant_id: distributorTenantId,
      product_id: item.productId,
      product_name: item.productName,
      category: item.category,
      selling_price: item.sellingPrice,
      cost_price: item.costPrice,
      active: item.active !== false,
    };
    const invPayload = {
      tenant_id: distributorTenantId,
      product_id: item.productId,
      product_name: item.productName,
      current_stock: item.currentStock,
      min_stock: item.minStock,
    };

    const prod = await supabase.from("products").upsert(productPayload, {
      onConflict: "tenant_id,product_id",
    });
    if (!prod.error) synced += 1;

    await supabase.from("inventory").upsert(invPayload, {
      onConflict: "tenant_id,product_id",
    });
  }
  return { ok: synced > 0, synced };
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
  const localOk = isCatalogAssigned(config);

  return {
    ok: localOk && (metadataResult.skipped || metadataResult.ok),
    assignedCount: catalogAssignedCount(config),
    items,
    config,
    durablePatchOk: metadataResult.ok && !metadataResult.skipped,
    supabasePersisted: metadataResult.supabasePersisted === true,
    supabaseSkipped: metadataResult.skipped === true,
    supabaseVerify: metadataResult.verify || null,
    supabaseSync: sync,
    row: getRegistryTenant(id),
    error: localOk ? null : "Catalog assignment incomplete",
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

  await syncDistributorCatalogToSupabase(
    id,
    items.filter((i) => str(i.productId) === str(productId))
  );

  return {
    ok: true,
    items,
    config,
    supabasePersisted: metadataResult.supabasePersisted === true,
    row: getRegistryTenant(id),
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
