/**
 * Phase 9.2 — Founder Operating System navigation.
 * Orchestration shell only — no duplicate business logic.
 */

export const FOUNDER_OS_MODULES = Object.freeze([
  { id: "today", label: "Today's Business", screens: [{ id: "home", label: "Overview" }] },
  { id: "decisions", label: "Decision Queue", screens: [{ id: "queue", label: "Queue" }] },
  { id: "revenue", label: "Revenue", screens: [{ id: "summary", label: "Summary" }] },
  { id: "collections", label: "Collections", screens: [{ id: "summary", label: "Summary" }] },
  { id: "operations", label: "Operations", screens: [{ id: "summary", label: "Summary" }] },
  { id: "people", label: "People", screens: [{ id: "summary", label: "Summary" }] },
  { id: "inventory", label: "Inventory", screens: [{ id: "summary", label: "Summary" }] },
  { id: "growth", label: "Growth", screens: [{ id: "summary", label: "Summary" }] },
  { id: "risks", label: "Risks", screens: [{ id: "priority", label: "Priority List" }] },
  { id: "forecast", label: "Forecast", screens: [{ id: "outlook", label: "Outlook" }] },
  { id: "approvals", label: "Approvals", screens: [{ id: "inbox", label: "Inbox" }] },
  { id: "insights", label: "Insights", screens: [{ id: "rules", label: "Founder Insights" }] },
  { id: "search", label: "Search", screens: [{ id: "global", label: "Global Search" }] },
]);

export function defaultFounderOsRoute() {
  return { moduleId: "today", screenId: "home" };
}

export function resolveFounderOsRoute(moduleId, screenId) {
  const module = FOUNDER_OS_MODULES.find((row) => row.id === moduleId) || FOUNDER_OS_MODULES[0];
  const screen = module.screens.find((row) => row.id === screenId) || module.screens[0];
  return { moduleId: module.id, screenId: screen.id };
}

export function buildFounderOsBreadcrumbs({ moduleId, screenId } = {}) {
  const route = resolveFounderOsRoute(moduleId, screenId);
  const module = FOUNDER_OS_MODULES.find((row) => row.id === route.moduleId) || FOUNDER_OS_MODULES[0];
  const screen = module.screens.find((row) => row.id === route.screenId) || module.screens[0];
  const items = [{ label: "Founder OS" }, { label: module.label }];
  if (module.screens.length > 1) items.push({ label: screen.label });
  return items;
}

/** Map founder deep-link targets to portal page keys (no workflow duplication). */
export const FOUNDER_DEEP_LINK_PAGES = Object.freeze({
  commercial: "commercialCrm",
  people: "compensationPayroll",
  operations: "operationsCenter",
  collections: "risk",
  orders: "orders",
  inventory: "inventory",
  purchase: "purchase",
  contracts: "labContractEngine",
  efi: "executiveFinancialIntelligence",
  revenueFunnel: "revenueFunnel",
  qualification: "qualificationReview",
  readiness: "productionReadiness",
});
