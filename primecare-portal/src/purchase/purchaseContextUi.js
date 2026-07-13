function str(value) {
  return String(value ?? "").trim();
}

export const PURCHASE_VIEW_LABELS = {
  triggers: "Forecast Suggestions",
  reorder: "Reorder Candidates",
  smart: "Smart Reorder",
  create: "Create PO",
  receive: "Receive Stock",
  history: "Purchase Orders",
  suppliers: "Suppliers",
};

export const PURCHASE_SORT_LABELS = {
  date: "Date",
  status: "Status",
  product: "Product",
};

/**
 * Compact context strip parts for Purchase orientation.
 */
export function buildPurchaseContextParts({
  activeTab = "triggers",
  selectedPoId = "",
  supplier = "",
  searchQuery = "",
  statusFilter = "",
  sortLabel = "",
  freezeActive = false,
} = {}) {
  const parts = [];
  const viewLabel = PURCHASE_VIEW_LABELS[str(activeTab)] || str(activeTab) || "Purchase";
  parts.push(viewLabel);
  if (str(selectedPoId)) parts.push(str(selectedPoId));
  if (str(supplier)) parts.push(str(supplier));
  if (str(searchQuery)) parts.push(`Search: “${str(searchQuery)}”`);
  if (str(statusFilter)) parts.push(`Status: ${str(statusFilter)}`);
  if (str(sortLabel)) parts.push(`Sort: ${str(sortLabel)}`);
  if (freezeActive) parts.push("Writes frozen");
  return parts;
}

function hasActiveHistoryFilters({ search = "", statusFilter = "" } = {}) {
  return Boolean(str(search) || str(statusFilter));
}

/**
 * Differentiated empty-state copy for Purchase lists.
 */
export function buildPurchaseListEmptyCopy(options = {}) {
  const {
    purchaseOrderLength = 0,
    search = "",
    statusFilter = "",
    pendingReceiptLength = null,
    criticalLength = null,
    readFailed = false,
    listKind = "history",
  } = options;

  if (readFailed) {
    return {
      code: "READ_FAILED",
      title: "Purchase data could not be loaded",
      message: "Check the error banner above, then retry.",
      action: "retry",
      actionLabel: "Retry load",
    };
  }

  if (listKind === "receive" && Number(pendingReceiptLength) === 0) {
    return {
      code: "NO_PENDING_RECEIPTS",
      title: "No pending receipts",
      message: "There are no Ordered or Partially Received purchase orders with remaining quantity.",
      action: "open_history",
      actionLabel: "Open Purchase Orders",
    };
  }

  if (listKind === "critical" && Number(criticalLength) === 0) {
    return {
      code: "NO_CRITICAL",
      title: "No critical purchases",
      message: "No forecast suggestions are currently Critical.",
      action: "open_triggers",
      actionLabel: "Review Forecast Suggestions",
    };
  }

  if (Number(purchaseOrderLength) === 0 && listKind === "history") {
    return {
      code: "NO_PURCHASE_ORDERS",
      title: "No purchase orders yet",
      message: "Create a purchase order from Create PO or Forecast Suggestions.",
      action: "open_create",
      actionLabel: "Create Purchase Order",
    };
  }

  if (str(search)) {
    return {
      code: "SEARCH_EMPTY",
      title: "No search results",
      message: `Nothing matched “${str(search)}”. Try a different PO, product, or supplier.`,
      action: "clear_search",
      actionLabel: "Clear Search",
    };
  }

  if (hasActiveHistoryFilters({ search, statusFilter })) {
    return {
      code: "FILTER_EMPTY",
      title: "No filter results",
      message: "Adjust status or search filters to broaden results.",
      action: "clear_filters",
      actionLabel: "Clear Filters",
    };
  }

  return {
    code: "EMPTY",
    title: "Nothing to show",
    message: "Refresh the list or change views.",
    action: "refresh",
    actionLabel: "Refresh",
  };
}

/**
 * Copy when a selected PO exists but is outside the current History filter set.
 */
export function buildFocusedPoOutsideFiltersCopy({ poId = "" } = {}) {
  const id = str(poId) || "This purchase order";
  return {
    code: "FOCUS_OUTSIDE_FILTERS",
    title: "Selected purchase order is outside current filters",
    message: `${id} stays selected but is hidden by the current search or status filter.`,
    clearLabel: "Clear Filters",
    returnLabel: "Return to Purchase",
  };
}

/**
 * Start Here actions from existing Purchase counts only — no new prioritization math.
 */
export function buildPurchaseStartHereActions({
  pendingReceiptCount = 0,
  criticalCount = 0,
  blockedCount = 0,
  purchaseOrderCount = 0,
} = {}) {
  const pending = Number(pendingReceiptCount) || 0;
  const critical = Number(criticalCount) || 0;
  const blocked = Number(blockedCount) || 0;
  const total = Number(purchaseOrderCount) || 0;

  const actions = [
    {
      id: "create_po",
      label: "Create Purchase Orders",
      description: "Draft or submit a purchase order for catalog stock.",
      kind: "tab",
      tab: "create",
      primary: pending === 0 && critical === 0 && blocked === 0,
    },
    {
      id: "receive_pending",
      label: "Receive Pending Deliveries",
      description:
        pending === 0
          ? "No receivable purchase orders right now."
          : pending === 1
            ? "1 purchase order is ready to receive."
            : `${pending} purchase orders are ready to receive.`,
      kind: "tab",
      tab: "receive",
      primary: pending > 0,
    },
  ];

  if (critical > 0) {
    actions.push({
      id: "review_critical",
      label: "Review Critical Reorders",
      description:
        critical === 1
          ? "1 Critical forecast suggestion needs review."
          : `${critical} Critical forecast suggestions need review.`,
      kind: "tab",
      tab: "triggers",
      primary: pending === 0,
    });
  }

  if (blocked > 0) {
    actions.push({
      id: "investigate_blocked",
      label: "Investigate Blocked Purchase Orders",
      description:
        blocked === 1
          ? "1 suggestion is blocked by an open purchase order."
          : `${blocked} suggestions are blocked by open purchase orders.`,
      kind: "tab",
      tab: "triggers",
      primary: pending === 0 && critical === 0,
    });
  }

  if (total === 0 && pending === 0 && critical === 0) {
    actions[0].primary = true;
  }

  return actions;
}

export function purchaseSortLabel(sortKey = "date") {
  return PURCHASE_SORT_LABELS[str(sortKey)] || "Date";
}

export function poRowKey(po = {}) {
  return str(po.poId || po.po_id);
}

export const PURCHASE_WORKSPACE_PRIMARY_QUESTION =
  "What purchasing work should I do now?";
