/**
 * Purchase workspace presentation helpers (Sprint 1C).
 * No PO write semantics, PURCHASE_IN, reorder math, or routing changes.
 */

function str(value) {
  return String(value ?? "").trim();
}

/** Operational primary question — Sprint 1C page budget. */
export const PURCHASE_WORKSPACE_PRIMARY_QUESTION = "What purchasing work should I do now?";

/**
 * Single operational queue hierarchy (presentation only).
 * Maps to existing tabs — does not invent workflows.
 */
export const PURCHASE_QUEUE_HIERARCHY = [
  {
    id: "critical",
    label: "Critical Reorders",
    tab: "triggers",
    purpose: "Review Critical and High forecast suggestions first.",
    whenToUse: "Use when Inventory Health urgency is Critical or High.",
  },
  {
    id: "forecast",
    label: "Forecast Drafts",
    tab: "reorder",
    purpose: "Min-stock candidates and smart draft quantities.",
    whenToUse: "Use when basic reorder levels or suggested quantities need a draft PO.",
    relatedTabs: ["smart"],
  },
  {
    id: "pending",
    label: "Pending Receipts",
    tab: "receive",
    purpose: "Receive Ordered or Partially Received purchase orders.",
    whenToUse: "Use when goods have arrived against an open PO.",
  },
  {
    id: "history",
    label: "Purchase History",
    tab: "history",
    purpose: "Search, select, edit, cancel, and track purchase orders.",
    whenToUse: "Use to find a PO or continue after create/receive.",
  },
];

export const PURCHASE_QUEUE_SECONDARY = [
  {
    id: "create",
    label: "Create PO",
    tab: "create",
    purpose: "Manually draft or submit a purchase order.",
  },
  {
    id: "suppliers",
    label: "Suppliers",
    tab: "suppliers",
    purpose: "Year-1 reference only — not a supplier master.",
  },
];

export const PURCHASE_SUPPLIERS_HONESTY = {
  title: "Supplier management is planned for a future release",
  message:
    "This area currently provides reference information only. Year-1 purchase orders use free-text supplier names on Create PO — there is no supplier master or blocking workflow yet.",
};

/**
 * Which queue row is active for a given tab (presentation).
 */
export function resolvePurchaseQueueId(activeTab = "triggers") {
  const tab = str(activeTab);
  if (tab === "triggers") return "critical";
  if (tab === "reorder" || tab === "smart") return "forecast";
  if (tab === "receive") return "pending";
  if (tab === "history") return "history";
  if (tab === "create") return "create";
  if (tab === "suppliers") return "suppliers";
  return "critical";
}

/**
 * One-line expected action for the selected purchase order (discoverability).
 * Uses existing status / remaining qty only — no new prioritization.
 */
export function getPurchaseExpectedActionCopy({
  status = "",
  remainingQty = 0,
  receivedQty = 0,
} = {}) {
  const s = str(status);
  const remaining = Number(remainingQty) || 0;
  const received = Number(receivedQty) || 0;

  if (s === "Ordered" || s === "Partially Received") {
    if (remaining > 0) {
      return {
        action: "Receive pending delivery",
        reason: `${s} with ${remaining} remaining to put away.`,
      };
    }
    return {
      action: "Review purchase history",
      reason: `${s} with no remaining quantity.`,
    };
  }
  if (s === "Draft") {
    return {
      action: "Edit or submit as Ordered",
      reason: "Draft purchase orders can be edited or cancelled before receive.",
    };
  }
  if (s === "Received") {
    return {
      action: "No receive action needed",
      reason: `Fully received (${received} units recorded).`,
    };
  }
  if (s === "Cancelled") {
    return {
      action: "No further purchase action",
      reason: "This purchase order is cancelled.",
    };
  }
  return {
    action: "Review purchase order",
    reason: "Select a queue item or open Create PO to continue.",
  };
}
