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
import { patchDurableTenantMetadata } from "@/tenant/durableTenantStore.js";
import { getRegistryTenant, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";
import { supabase } from "@/api/supabaseClient.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Resolve distributor tenant from Distributor OS scope — never infer from global HQ view.
 */
export function resolveDistributorRow(tenantId, distributorRow = null) {
  const id = str(tenantId);
  if (!id) return null;

  const fromRegistry = getRegistryTenant(id);
  if (fromRegistry) return fromRegistry;

  const fallback = distributorRow || null;
  const fallbackId = str(fallback?.id ?? fallback?.tenantId);
  if (!fallback || fallbackId !== id) return null;

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

function persistDistributorCatalog(row, config, tenantId) {
  const now = new Date().toISOString();
  const updated = {
    ...row,
    id: tenantId,
    tenantId,
    config,
    updatedAt: now,
  };
  upsertRegistryTenant(updated);
  return updated;
}

export async function loadDistributorCatalogBundle(
  distributorTenantId,
  homeTenantId,
  options = {}
) {
  const id = str(distributorTenantId);
  const home = str(homeTenantId);
  const row = resolveDistributorRow(id, options.distributorRow);

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

  const row = resolveDistributorRow(id, options.distributorRow || options.fallbackTenant);
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

  persistDistributorCatalog(row, config, id);
  markProvisioningMilestone(id, "catalog_configured");

  let durablePatchOk = true;
  if (row.durable || row.source === "database") {
    const fresh = getRegistryTenant(id) || { ...row, config };
    const patch = await patchDurableTenantMetadata(id, {
      config: fresh.config || config,
      provisioning: fresh.provisioning || row.provisioning || {},
    });
    durablePatchOk = patch.ok;
    if (patch.ok) {
      upsertRegistryTenant({
        ...fresh,
        config: fresh.config || config,
        syncFailed: false,
        lastSyncError: null,
        durable: true,
        source: "database",
      });
    }
  }

  const sync = await syncDistributorCatalogToSupabase(id, items);

  return {
    ok: isCatalogAssigned(config),
    assignedCount: catalogAssignedCount(config),
    items,
    config,
    durablePatchOk,
    supabaseSync: sync,
    row: getRegistryTenant(id),
  };
}

export async function updateDistributorCatalogItem(
  distributorTenantId,
  productId,
  patch = {},
  options = {}
) {
  const id = str(distributorTenantId);
  const row = resolveDistributorRow(id, options.distributorRow);
  if (!row) return { ok: false, error: "Distributor not found" };

  const items = updateDistributorCatalogPricing(readDistributorCatalogItems(row.config), productId, patch);
  const config = buildConfigPatch(row, items);
  persistDistributorCatalog(row, config, id);

  if (row.durable || row.source === "database") {
    await patchDurableTenantMetadata(id, { config, provisioning: row.provisioning || {} });
  }
  await syncDistributorCatalogToSupabase(
    id,
    items.filter((i) => str(i.productId) === str(productId))
  );

  return { ok: true, items, config, row: getRegistryTenant(id) };
}

export async function unassignDistributorCatalogProduct(
  distributorTenantId,
  productId,
  options = {}
) {
  const id = str(distributorTenantId);
  const row = resolveDistributorRow(id, options.distributorRow);
  if (!row) return { ok: false, error: "Distributor not found" };

  const items = removeDistributorCatalogItem(readDistributorCatalogItems(row.config), productId);
  const config = buildConfigPatch(row, items);
  persistDistributorCatalog(row, config, id);

  if (row.durable || row.source === "database") {
    await patchDurableTenantMetadata(id, { config, provisioning: row.provisioning || {} });
  }

  return {
    ok: true,
    assignedCount: items.length,
    catalogAssigned: isCatalogAssigned(config),
    row: getRegistryTenant(id),
  };
}

/** Quick-assign all HQ master products (replaces legacy standard catalog enable). */
export async function assignAllMasterCatalogToDistributor(tenantId, options = {}) {
  return assignMasterProductsToDistributor(tenantId, [], options);
}
