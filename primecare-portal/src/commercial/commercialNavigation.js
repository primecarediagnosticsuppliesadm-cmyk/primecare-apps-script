/**
 * Phase 9.0 — Commercial workspace navigation.
 * Compose shell only — not a Salesforce CRM.
 */

export const COMMERCIAL_MODULES = Object.freeze([
  {
    id: "dashboard",
    label: "Dashboard",
    screens: [{ id: "home", label: "Overview" }],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    screens: [{ id: "board", label: "Stages" }],
  },
  {
    id: "labs",
    label: "Labs",
    screens: [{ id: "directory", label: "Commercial Lab 360" }],
  },
  {
    id: "activities",
    label: "Activities",
    screens: [{ id: "timeline", label: "Field Activity" }],
  },
  {
    id: "contracts",
    label: "Contracts",
    screens: [{ id: "portfolio", label: "Portfolio" }],
  },
  {
    id: "forecast",
    label: "Forecast",
    screens: [{ id: "outlook", label: "Outlook" }],
  },
  {
    id: "reports",
    label: "Reports",
    screens: [{ id: "analytics", label: "Commercial Reports" }],
  },
]);

export function defaultCommercialRoute() {
  return { moduleId: "dashboard", screenId: "home" };
}

export function resolveCommercialRoute(moduleId, screenId) {
  const module = COMMERCIAL_MODULES.find((row) => row.id === moduleId) || COMMERCIAL_MODULES[0];
  const screen = module.screens.find((row) => row.id === screenId) || module.screens[0];
  return { moduleId: module.id, screenId: screen.id };
}

export function buildCommercialBreadcrumbs({ moduleId, screenId } = {}) {
  const route = resolveCommercialRoute(moduleId, screenId);
  const module = COMMERCIAL_MODULES.find((row) => row.id === route.moduleId) || COMMERCIAL_MODULES[0];
  const screen = module.screens.find((row) => row.id === route.screenId) || module.screens[0];
  const items = [{ label: "Commercial" }, { label: module.label }];
  if (module.screens.length > 1) items.push({ label: screen.label });
  return items;
}
