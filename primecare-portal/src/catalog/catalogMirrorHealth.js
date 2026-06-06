/**
 * Catalog mirror health model — metadata authoritative, products/inventory mirrors best-effort.
 */

export const CATALOG_SYNC_STATUS = {
  SYNCED: "Synced",
  METADATA_ONLY: "Metadata Only",
  SYNC_FAILED: "Sync Failed",
  SYNC_PENDING: "Sync Pending",
};

export const LAYER_OUTCOME = {
  PASS: "PASS",
  FAIL: "FAIL",
  PENDING: "PENDING",
  SKIP: "SKIP",
};

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {object} [result] updateDistributorCatalogItem / assign result
 * @returns {{ metadata: string, products: string, inventory: string }}
 */
export function parseSyncLayersFromResult(result = {}) {
  const sync = result.supabaseSync || {};

  let metadata = LAYER_OUTCOME.PENDING;
  if (result.ok && !result.localOnly) metadata = LAYER_OUTCOME.PASS;
  else if (result.localOnly || result.ok === false) metadata = LAYER_OUTCOME.FAIL;

  let products = LAYER_OUTCOME.PENDING;
  if (sync.skipped) {
    products = LAYER_OUTCOME.SKIP;
  } else if (sync.productError) {
    products = LAYER_OUTCOME.FAIL;
  } else if (metadata === LAYER_OUTCOME.PASS && num(sync.synced) > 0) {
    products = LAYER_OUTCOME.PASS;
  } else if (metadata === LAYER_OUTCOME.PASS) {
    products = LAYER_OUTCOME.FAIL;
  }

  let inventory = LAYER_OUTCOME.PENDING;
  if (sync.skipped) {
    inventory = LAYER_OUTCOME.SKIP;
  } else if (sync.inventoryError) {
    inventory = LAYER_OUTCOME.FAIL;
  } else if (metadata === LAYER_OUTCOME.PASS && num(sync.synced) > 0 && !sync.inventoryError) {
    inventory = LAYER_OUTCOME.PASS;
  } else if (metadata === LAYER_OUTCOME.PASS) {
    inventory = LAYER_OUTCOME.FAIL;
  }

  return { metadata, products, inventory };
}

function layerFromProbe({ catalogItemsCount, mirroredCount, lastLayer }) {
  if (catalogItemsCount <= 0) return LAYER_OUTCOME.SKIP;
  if (num(mirroredCount) >= catalogItemsCount) return LAYER_OUTCOME.PASS;
  if (lastLayer === LAYER_OUTCOME.PASS || lastLayer === LAYER_OUTCOME.FAIL) return lastLayer;
  return num(mirroredCount) > 0 ? LAYER_OUTCOME.FAIL : LAYER_OUTCOME.FAIL;
}

/**
 * @param {object} input
 * @param {number} [input.catalogItemsCount]
 * @param {number|null} [input.mirroredProductsCount]
 * @param {number|null} [input.mirroredInventoryCount]
 * @param {object|null} [input.lastAttempt]
 * @param {boolean} [input.diagnosticsLoading]
 */
export function buildCatalogMirrorHealth(input = {}) {
  const catalogItemsCount = num(input.catalogItemsCount);
  const mirroredProductsCount =
    input.mirroredProductsCount == null ? null : num(input.mirroredProductsCount);
  const mirroredInventoryCount =
    input.mirroredInventoryCount == null ? null : num(input.mirroredInventoryCount);
  const lastAttempt = input.lastAttempt || null;
  const diagnosticsLoading = Boolean(input.diagnosticsLoading);

  const lastLayers = lastAttempt?.layers || {};
  const probeReady =
    !diagnosticsLoading &&
    mirroredProductsCount != null &&
    mirroredInventoryCount != null;

  const layers = {
    metadata:
      catalogItemsCount > 0
        ? lastLayers.metadata === LAYER_OUTCOME.FAIL
          ? LAYER_OUTCOME.FAIL
          : LAYER_OUTCOME.PASS
        : lastLayers.metadata || LAYER_OUTCOME.PENDING,
    products: probeReady
      ? layerFromProbe({
          catalogItemsCount,
          mirroredCount: mirroredProductsCount,
          lastLayer: lastLayers.products,
        })
      : lastLayers.products || LAYER_OUTCOME.PENDING,
    inventory: probeReady
      ? layerFromProbe({
          catalogItemsCount,
          mirroredCount: mirroredInventoryCount,
          lastLayer: lastLayers.inventory,
        })
      : lastLayers.inventory || LAYER_OUTCOME.PENDING,
  };

  if (lastAttempt?.layers) {
    if (lastAttempt.layers.metadata) layers.metadata = lastAttempt.layers.metadata;
    if (!probeReady && lastAttempt.layers.products) layers.products = lastAttempt.layers.products;
    if (!probeReady && lastAttempt.layers.inventory) {
      layers.inventory = lastAttempt.layers.inventory;
    }
  }

  let status = CATALOG_SYNC_STATUS.SYNC_PENDING;

  if (diagnosticsLoading) {
    status = CATALOG_SYNC_STATUS.SYNC_PENDING;
  } else if (lastAttempt?.layers?.metadata === LAYER_OUTCOME.FAIL) {
    status = CATALOG_SYNC_STATUS.SYNC_FAILED;
  } else if (catalogItemsCount === 0 && !lastAttempt) {
    status = CATALOG_SYNC_STATUS.SYNC_PENDING;
  } else if (
    layers.metadata === LAYER_OUTCOME.PASS &&
    layers.products === LAYER_OUTCOME.PASS &&
    layers.inventory === LAYER_OUTCOME.PASS &&
    catalogItemsCount > 0
  ) {
    status = CATALOG_SYNC_STATUS.SYNCED;
  } else if (layers.metadata === LAYER_OUTCOME.PASS && catalogItemsCount > 0) {
    status = CATALOG_SYNC_STATUS.METADATA_ONLY;
  } else if (lastAttempt && layers.metadata === LAYER_OUTCOME.FAIL) {
    status = CATALOG_SYNC_STATUS.SYNC_FAILED;
  } else if (catalogItemsCount > 0) {
    status = CATALOG_SYNC_STATUS.METADATA_ONLY;
  }

  const probeStatus = probeReady
    ? buildCatalogMirrorHealth({
        catalogItemsCount,
        mirroredProductsCount,
        mirroredInventoryCount,
        lastAttempt: null,
        diagnosticsLoading: false,
      }).status
    : null;

  const syncStatusConsistent =
    !lastAttempt?.status || !probeStatus
      ? true
      : lastAttempt.status === probeStatus || lastAttempt.status === status;

  return {
    status,
    layers,
    catalogItemsCount,
    mirroredProductsCount,
    mirroredInventoryCount,
    lastSyncAttemptAt: lastAttempt?.at || null,
    lastSyncAttemptStatus: lastAttempt?.status || null,
    syncStatusConsistent,
    metadataAuthoritative: true,
  };
}

/**
 * @param {string} productLabel
 * @param {{ metadata: string, products: string, inventory: string }} layers
 */
export function formatCatalogSaveResultLines(productLabel, layers = {}) {
  return {
    headline: `Catalog item saved${productLabel ? ` — ${productLabel}` : ""}.`,
    metadata: `Metadata: ${layers.metadata || LAYER_OUTCOME.PENDING}`,
    products: `Products mirror: ${layers.products || LAYER_OUTCOME.PENDING}`,
    inventory: `Inventory mirror: ${layers.inventory || LAYER_OUTCOME.PENDING}`,
  };
}

export function isCatalogMirrorFullySynced(health = null) {
  return health?.status === CATALOG_SYNC_STATUS.SYNCED;
}

export function catalogMirrorStatusVariant(status) {
  switch (status) {
    case CATALOG_SYNC_STATUS.SYNCED:
      return "success";
    case CATALOG_SYNC_STATUS.METADATA_ONLY:
      return "warning";
    case CATALOG_SYNC_STATUS.SYNC_FAILED:
      return "danger";
    default:
      return "neutral";
  }
}
