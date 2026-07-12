function str(value) {
  return String(value ?? "").trim();
}

export const INVENTORY_HEALTH_FILTERS = {
  CRITICAL: "Critical",
  REORDER: "Reorder",
};

export const INVENTORY_VIEW_LABELS = {
  stock: "Stock",
  ledger: "Movements",
  health: "Health",
};

/**
 * Compact context strip parts for Inventory orientation.
 */
export function buildInventoryContextParts({
  activeTab = "stock",
  selectedProductId = "",
  selectedCategory = "",
  warehouseLabel = "",
  searchQuery = "",
  tenantFilterLabel = "",
  healthFilter = "",
  sortLabel = "",
  freezeActive = false,
} = {}) {
  const parts = [];
  const viewLabel = INVENTORY_VIEW_LABELS[str(activeTab)] || str(activeTab) || "Stock";
  parts.push(viewLabel);
  if (str(selectedProductId)) parts.push(str(selectedProductId));
  if (str(selectedCategory)) parts.push(str(selectedCategory));
  if (str(warehouseLabel)) parts.push(str(warehouseLabel));
  if (str(searchQuery)) parts.push(`Search: “${str(searchQuery)}”`);
  if (str(tenantFilterLabel)) parts.push(str(tenantFilterLabel));
  if (str(healthFilter)) parts.push(`Filter: ${str(healthFilter)}`);
  if (str(sortLabel)) parts.push(`Sort: ${str(sortLabel)}`);
  if (freezeActive) parts.push("Writes frozen");
  return parts;
}

function hasActiveListFilters({
  search = "",
  tenantFilter = "hq",
  healthFilter = "",
} = {}) {
  return Boolean(str(search) || str(healthFilter) || (str(tenantFilter) && tenantFilter !== "hq"));
}

/**
 * Differentiated empty-state copy for the inventory list.
 */
export function buildInventoryListEmptyCopy(options = {}) {
  const {
    inventoryLength = 0,
    search = "",
    tenantFilter = "hq",
    healthFilter = "",
    readFailed = false,
  } = options;

  if (readFailed) {
    return {
      code: "READ_FAILED",
      title: "Inventory could not be loaded",
      message: "Check the error banner above, then retry.",
      action: "retry",
      actionLabel: "Retry load",
    };
  }

  if (Number(inventoryLength) === 0) {
    return {
      code: "NO_INVENTORY",
      title: "No inventory yet",
      message: "Create a SKU with opening stock in Master Catalog, or receive a purchase order.",
      action: "open_catalog",
      actionLabel: "Open Master Catalog",
    };
  }

  if (str(healthFilter) === INVENTORY_HEALTH_FILTERS.CRITICAL) {
    return {
      code: "NO_CRITICAL",
      title: "No critical stock",
      message: "No SKUs are marked Critical in the current scope.",
      action: "clear_health",
      actionLabel: "Clear Critical Filter",
    };
  }

  if (str(healthFilter) === INVENTORY_HEALTH_FILTERS.REORDER) {
    return {
      code: "NO_REORDER",
      title: "No reorder candidates",
      message: "No SKUs are marked Reorder in the current scope.",
      action: "clear_health",
      actionLabel: "Clear Reorder Filter",
    };
  }

  if (str(search)) {
    return {
      code: "SEARCH_EMPTY",
      title: "No inventory matches search",
      message: `Nothing matched “${str(search)}”. Try a different SKU, name, or category.`,
      action: "clear_search",
      actionLabel: "Clear Search",
    };
  }

  if (hasActiveListFilters({ search, tenantFilter, healthFilter })) {
    return {
      code: "FILTER_EMPTY",
      title: "No inventory matches filters",
      message: "Adjust distributor or health filters to broaden results.",
      action: "clear_filters",
      actionLabel: "Clear Filters",
    };
  }

  return {
    code: "EMPTY",
    title: "No inventory to show",
    message: "Refresh the list or adjust your scope.",
    action: "refresh",
    actionLabel: "Refresh",
  };
}

/**
 * Copy when a focused/selected SKU exists but is outside the current filter set.
 */
export function buildFocusedSkuOutsideFiltersCopy({ productId = "" } = {}) {
  const id = str(productId) || "This SKU";
  return {
    code: "FOCUS_OUTSIDE_FILTERS",
    title: "Focused SKU is outside current filters",
    message: `${id} stays selected but is hidden by the current search or filters.`,
    clearLabel: "Clear Filters",
    returnLabel: "Return to Inventory",
  };
}

/**
 * Start Here actions from existing stockHealth buckets only — no new prioritization math.
 */
export function buildInventoryStartHereActions({
  criticalCount = 0,
  reorderCount = 0,
  inventoryLength = 0,
} = {}) {
  const actions = [];
  const critical = Number(criticalCount) || 0;
  const reorder = Number(reorderCount) || 0;
  const total = Number(inventoryLength) || 0;

  actions.push({
    id: "receive_po",
    label: "Receive Purchase Order",
    description: "Put away stock from an eligible purchase order.",
    kind: "navigate",
    target: "purchase",
    tab: "receive",
    primary: critical === 0 && reorder === 0 && total > 0,
  });

  if (critical > 0) {
    actions.push({
      id: "review_critical",
      label: "Review Critical Stock",
      description:
        critical === 1 ? "1 SKU is Critical." : `${critical} SKUs are Critical.`,
      kind: "filter",
      healthFilter: INVENTORY_HEALTH_FILTERS.CRITICAL,
      primary: true,
    });
  }

  actions.push({
    id: "create_po",
    label: "Create Purchase Order",
    description: "Open Purchase to create a replenishment PO.",
    kind: "navigate",
    target: "purchase",
    tab: "create",
    primary: false,
  });

  if (reorder > 0) {
    actions.push({
      id: "review_reorder",
      label: "Review Reorder Candidates",
      description:
        reorder === 1 ? "1 SKU is at Reorder." : `${reorder} SKUs are at Reorder.`,
      kind: "filter",
      healthFilter: INVENTORY_HEALTH_FILTERS.REORDER,
      primary: critical === 0,
    });
  }

  actions.push({
    id: "investigate_risk",
    label: "Investigate Stock Risk",
    description: "Open Health for velocity and risk signals.",
    kind: "tab",
    tab: "health",
    primary: false,
  });

  if (total === 0) {
    actions.unshift({
      id: "opening_stock",
      label: "Set Opening Stock",
      description: "Create a SKU with opening stock in Master Catalog.",
      kind: "navigate",
      target: "masterCatalog",
      primary: true,
    });
  }

  return actions;
}

export function inventorySortLabel(sortKey = "name") {
  const key = str(sortKey);
  if (key === "health") return "Health";
  if (key === "stock") return "On hand";
  return "Name";
}

export function skuRowKey(item = {}) {
  return `${str(item.tenantId)}|${str(item.productId)}`;
}
