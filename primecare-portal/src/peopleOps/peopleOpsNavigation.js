/**
 * People Operations module navigation — Phase 8.1 shell.
 * Maps product modules/screens to legacy Executive Compensation surfaces.
 */

export const PEOPLE_OPS_MODULES = Object.freeze([
  {
    id: "dashboard",
    label: "Dashboard",
    screens: [{ id: "home", label: "Overview" }],
  },
  {
    id: "employees",
    label: "Employees",
    screens: [
      { id: "directory", label: "Directory" },
      { id: "workspace", label: "Employee Workspace", navHidden: true },
    ],
  },
  {
    id: "compensation",
    label: "Compensation",
    screens: [
      { id: "plans", label: "Compensation Plans" },
      { id: "assignments", label: "Compensation Assignments" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    screens: [
      { id: "periods", label: "Pay Periods" },
      { id: "run-review", label: "Payroll Preview" },
      { id: "commission-ledger", label: "Commission Ledger" },
      { id: "activity", label: "Activity" },
      { id: "exports", label: "Exports" },
    ],
  },
  {
    id: "budgeting",
    label: "Budgeting",
    screens: [
      { id: "overview", label: "Budget Overview" },
      { id: "headcount", label: "Headcount Planning" },
      { id: "department-budget", label: "Department Budget" },
      { id: "scenarios", label: "Scenario Planning" },
      { id: "history", label: "Budget History" },
    ],
  },
  {
    id: "ownership",
    label: "Business Ownership",
    screens: [
      { id: "explorer", label: "Explorer" },
      { id: "territories", label: "Territories" },
      { id: "dashboard", label: "Dashboard" },
      { id: "timeline", label: "Timeline" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    screens: [{ id: "analytics", label: "Analytics" }],
  },
  {
    id: "settings",
    label: "Settings",
    screens: [{ id: "configuration", label: "Configuration" }],
  },
]);

/** @deprecated Legacy flat tab IDs for deep links and migration */
export const LEGACY_TAB_TO_ROUTE = Object.freeze({
  Overview: { moduleId: "dashboard", screenId: "home" },
  "Compensation Plans": { moduleId: "compensation", screenId: "plans" },
  "Plan Assignments": { moduleId: "compensation", screenId: "assignments" },
  "Payroll Periods": { moduleId: "payroll", screenId: "periods" },
  "Payroll Preview": { moduleId: "payroll", screenId: "run-review" },
  Employees: { moduleId: "employees", screenId: "directory" },
  "Commission History": { moduleId: "payroll", screenId: "commission-ledger" },
  Audit: { moduleId: "payroll", screenId: "activity" },
  Exports: { moduleId: "payroll", screenId: "exports" },
});

export function defaultPeopleOpsRoute() {
  return { moduleId: "dashboard", screenId: "home" };
}

export function resolvePeopleOpsRoute(moduleId, screenId) {
  const module = PEOPLE_OPS_MODULES.find((row) => row.id === moduleId) || PEOPLE_OPS_MODULES[0];
  const screen = module.screens.find((row) => row.id === screenId) || module.screens[0];
  return { moduleId: module.id, screenId: screen.id };
}

export function moduleForRoute({ moduleId, screenId }) {
  const route = resolvePeopleOpsRoute(moduleId, screenId);
  return PEOPLE_OPS_MODULES.find((row) => row.id === route.moduleId) || PEOPLE_OPS_MODULES[0];
}

export function buildPeopleOpsBreadcrumbs({ moduleId, screenId, employeeName } = {}) {
  const route = resolvePeopleOpsRoute(moduleId, screenId);
  const module = PEOPLE_OPS_MODULES.find((row) => row.id === route.moduleId) || PEOPLE_OPS_MODULES[0];
  const visibleScreens = module.screens.filter((row) => !row.navHidden);
  const screen = module.screens.find((row) => row.id === route.screenId) || module.screens[0];
  const defaultScreenId = visibleScreens[0]?.id || module.screens[0].id;

  const items = [
    { label: "People Operations", route: defaultPeopleOpsRoute() },
    { label: module.label, route: { moduleId: module.id, screenId: defaultScreenId } },
  ];

  if (route.moduleId === "employees" && route.screenId === "workspace") {
    items.push({ label: "Directory", route: { moduleId: "employees", screenId: "directory" } });
    if (employeeName) items.push({ label: employeeName });
    return items;
  }

  if (visibleScreens.length > 1) {
    items.push({ label: screen.label });
  }

  return items;
}

export function breadcrumbRouteForItem(item) {
  if (!item?.route?.moduleId) return null;
  return resolvePeopleOpsRoute(item.route.moduleId, item.route.screenId);
}
