/** Static HQ page help copy — no backend. */
export const HQ_PAGE_HELP = {
  dashboard: {
    title: "Dashboard",
    what: "Your HQ command view for revenue, inventory health, receivables, and daily priorities.",
    doHere: "Start each session here. Scan Today's Work cards and jump to modules that need attention.",
    actions: ["Review priority cards", "Refresh KPIs", "Open quick links to Orders, Collections, Inventory"],
    related: ["orders", "notifications", "inventory"],
  },
  orders: {
    title: "Orders Monitor",
    what: "Track lab orders from placement through fulfillment and payment status.",
    doHere: "Find pending or stuck orders, open details, and update status when operations complete.",
    actions: ["Filter by lab or status", "Review order lines", "Mark fulfilled or cancelled with a note"],
    related: ["risk", "notifications", "inventory"],
  },
  collections: {
    title: "Collections",
    what: "HQ receivables workspace — outstanding balances, payment status, and collection follow-ups.",
    doHere: "Prioritize overdue labs, record payments, and coordinate with field agents on collections.",
    actions: ["Filter by risk or payment status", "Record payment", "Schedule follow-up", "Review lab account"],
    related: ["risk", "visits", "orders"],
  },
  risk: {
    title: "Credit & Risk",
    what: "Portfolio view of lab credit exposure, holds, and collection risk.",
    doHere: "Identify labs on hold or overdue before approving large orders or releases.",
    actions: ["Review high-risk labs", "Review lab account", "Coordinate with collections"],
    related: ["collections", "orders", "labs"],
  },
  notifications: {
    title: "Activity Center",
    what: "Unified operational feed across orders, payments, inventory, provisioning, and audit.",
    doHere: "Watch what changed recently and drill into modules when something needs follow-up.",
    actions: ["Filter by severity or module", "Switch timeline/table view", "Refresh feed"],
    related: ["accessAudit", "orders", "operationsCenter"],
  },
  visits: {
    title: "Visits",
    what: "Field visit log and agent activity tied to labs.",
    doHere: "Review recent visits and field execution quality.",
    actions: ["Search visits", "Open visit details", "Cross-check with Collections and Orders"],
    related: ["collections", "labs", "dashboard"],
  },
  masterCatalog: {
    title: "Master Catalog",
    what: "HQ-owned product master — SKUs, pricing, and catalog metadata.",
    doHere: "Maintain sellable products before distributors and labs can order them.",
    actions: ["Add or edit products", "Set pricing and units", "Deactivate obsolete SKUs"],
    related: ["inventory", "purchase", "orders"],
  },
  inventory: {
    title: "Inventory",
    what: "Stock levels, critical items, and reorder signals for HQ fulfillment.",
    doHere: "Resolve stockouts and reorder items before orders stall.",
    actions: ["Review critical SKUs", "Open ledger movements", "Plan purchase/reorder"],
    related: ["purchase", "masterCatalog", "orders"],
  },
  purchase: {
    title: "Purchase / Reorder",
    what: "Create and track purchase orders to suppliers.",
    doHere: "Replenish inventory when stock is low or forecasted to run out.",
    actions: ["Create PO", "Track PO status", "Receive against inventory"],
    related: ["inventory", "masterCatalog"],
  },
  operationsCenter: {
    title: "Operations Center — User & Access",
    what: "Provision users, assign labs, manage roles, and control platform access.",
    doHere: "Create users, assign agents to labs, deactivate access, and transfer ownership.",
    actions: ["Create user", "Assign labs", "Reset password", "Deactivate/reactivate"],
    related: ["accessAudit", "labs"],
  },
  accessAudit: {
    title: "Access Audit",
    what: "Read-only trail of provisioning, password resets, lab assignments, and role changes.",
    doHere: "Investigate who changed access and when — for compliance and troubleshooting.",
    actions: ["Filter by action type", "Open event detail", "Export mentally via screenshots if needed"],
    related: ["operationsCenter", "notifications"],
  },
  qualificationReview: {
    title: "Qualification Analytics",
    what: "Lab qualification pipeline metrics and review queue.",
    doHere: "Prioritize labs moving through qualification and spot stalled accounts.",
    actions: ["Review qualification rows", "Filter by stage", "Coordinate with field visits"],
    related: ["visits", "labs", "risk"],
  },
  predatorDebug: {
    title: "Predator Debug",
    what: "Internal QA validation console for KPI and RLS drift checks.",
    doHere: "Use during QA or incidents — not required for daily operations.",
    actions: ["Run module validators", "Compare API vs UI snapshots"],
    related: ["dashboard"],
  },
};

export function getHqPageHelp(pageKey) {
  return HQ_PAGE_HELP[pageKey] || null;
}
