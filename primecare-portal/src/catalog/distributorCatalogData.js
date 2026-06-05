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
import { patchDurableTenantMetadata } from "@/tenant/durableTenantStore.js";
import { getRegistryTenant, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";
import { supabase } from "@/api/supabaseClient.js";

function str(v) {
  return String(v ?? "").trim();
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

export async function loadDistributorCatalogBundle(distributorTenantId, homeTenantId) {
  const id = str(distributorTenantId);
  const home = str(homeTenantId);
  const [master, row] = await Promise.all([
    loadMasterCatalog(),
    Promise.resolve(getRegistryTenant(id)),
  ]);

  const assignedItems = readDistributorCatalogItems(row?.config || {});
  const model = buildDistributorCatalogModel({
    masterItems: master.items || [],
    assignedItems,
    distributorTenantId: id,
    homeTenantId: home,
  });

  return { master, registryRow: row, ...model };
}

export async function assignMasterProductsToDistributor(
  distributorTenantId,
  productIds = [],
  options = {}
) {
  const id = str(distributorTenantId);
  if (!id) return { ok: false, error: "Missing distributor tenant id" };

  const master = await loadMasterCatalog();
  const masterMap = new Map((master.items || []).map((p) => [str(p.productId), p]));
  const toAdd = (productIds.length ? productIds : [...masterMap.keys()])
    .map((pid) => masterMap.get(str(pid)))
    .filter(Boolean);

  if (!toAdd.length) {
    return { ok: false, error: "No HQ master products available to assign" };
  }

  let row = getRegistryTenant(id) || options.fallbackTenant;
  if (!row) return { ok: false, error: "Distributor not found" };

  const existing = readDistributorCatalogItems(row.config || {});
  const items = mergeAssignedItems(existing, toAdd, id);
  const config = buildConfigPatch(row, items);

  upsertRegistryTenant({ ...row, config, updatedAt: new Date().toISOString() });

  let durablePatchOk = true;
  if (row.durable || row.source === "database") {
    const patch = await patchDurableTenantMetadata(id, {
      config,
      provisioning: row.provisioning || {},
    });
    durablePatchOk = patch.ok;
  }

  const sync = await syncDistributorCatalogToSupabase(id, items);

  return {
    ok: isCatalogAssigned(config),
    assignedCount: catalogAssignedCount(config),
    items,
    durablePatchOk,
    supabaseSync: sync,
  };
}

export async function updateDistributorCatalogItem(
  distributorTenantId,
  productId,
  patch = {}
) {
  const id = str(distributorTenantId);
  const row = getRegistryTenant(id);
  if (!row) return { ok: false, error: "Distributor not found" };

  const items = updateDistributorCatalogPricing(readDistributorCatalogItems(row.config), productId, patch);
  const config = buildConfigPatch(row, items);
  upsertRegistryTenant({ ...row, config });

  if (row.durable || row.source === "database") {
    await patchDurableTenantMetadata(id, { config, provisioning: row.provisioning || {} });
  }
  await syncDistributorCatalogToSupabase(id, items.filter((i) => str(i.productId) === str(productId)));

  return { ok: true, items, config };
}

export async function unassignDistributorCatalogProduct(distributorTenantId, productId) {
  const id = str(distributorTenantId);
  const row = getRegistryTenant(id);
  if (!row) return { ok: false, error: "Distributor not found" };

  const items = removeDistributorCatalogItem(readDistributorCatalogItems(row.config), productId);
  const config = buildConfigPatch(row, items);
  upsertRegistryTenant({ ...row, config });

  if (row.durable || row.source === "database") {
    await patchDurableTenantMetadata(id, { config, provisioning: row.provisioning || {} });
  }

  return { ok: true, assignedCount: items.length, catalogAssigned: isCatalogAssigned(config) };
}

/** Quick-assign all HQ master products (replaces legacy standard catalog enable). */
export async function assignAllMasterCatalogToDistributor(tenantId, options = {}) {
  return assignMasterProductsToDistributor(tenantId, [], options);
}
