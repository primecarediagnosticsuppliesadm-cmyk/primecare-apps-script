import { PERMISSIONS } from "./permissions";
import { ROLES } from "./roles";
import { ALLOW_EXPERIMENTAL_MODULES, IS_QA, IS_PROD } from "./environment";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";

/** HQ Admin sidebar sections (order preserved within each group). */
export const HQ_ADMIN_MENU_SECTIONS = [
  { id: "home", label: "HOME", keys: ["dashboard"] },
  {
    id: "operations",
    label: "OPERATIONS",
    keys: ["orders", "risk", "notifications", "visits", "distributorOs"],
  },
  {
    id: "inventory",
    label: "INVENTORY",
    keys: ["masterCatalog", "inventory", "purchase"],
  },
  {
    id: "people",
    label: "PEOPLE",
    keys: ["operationsCenter", "accessAudit"],
  },
  { id: "growth", label: "GROWTH", keys: ["qualificationReview"] },
  { id: "system", label: "SYSTEM", keys: ["predatorDebug"] },
];

/** HQ Executive sidebar sections. */
export const HQ_EXECUTIVE_MENU_SECTIONS = [
  { id: "home", label: "HOME", keys: ["dashboard"] },
  {
    id: "founder",
    label: "FOUNDER",
    keys: [
      "founderNavigation",
      "founderStrategy",
      "founderFinancialIntelligence",
      "revenueFunnel",
      "pilotReadiness",
      "tenantManagement",
    ],
  },
  {
    id: "operations",
    label: "OPERATIONS",
    keys: ["orders", "risk", "notifications", "distributorOs", "operationsCenter"],
  },
  {
    id: "inventory",
    label: "INVENTORY",
    keys: ["masterCatalog", "inventory", "purchase"],
  },
  { id: "people", label: "PEOPLE", keys: ["accessAudit"] },
  { id: "growth", label: "GROWTH", keys: ["qualificationReview", "commissionEngine"] },
  { id: "system", label: "SYSTEM", keys: ["predatorDebug", "qaCommandCenter"] },
];

/** PrimeCare HQ sidebar — platform modules only (no distributor ops). */
const EXECUTIVE_HQ_MENU_KEYS = new Set([
  "dashboard",
  "founderNavigation",
  "founderStrategy",
  "founderFinancialIntelligence",
  "revenueFunnel",
  "qualificationReview",
  "pilotReadiness",
  "tenantManagement",
  "distributorOs",
  "operationsCenter",
  "accessAudit",
  "masterCatalog",
  "inventory",
  "orders",
  "risk",
  "purchase",
  "commissionEngine",
  "predatorDebug",
  "qaCommandCenter",
]);

const ADMIN_HQ_MENU_KEYS = new Set([
  "dashboard",
  "distributorOs",
  "operationsCenter",
  "accessAudit",
  "qualificationReview",
  "masterCatalog",
  "inventory",
  "orders",
  "risk",
  "purchase",
  "visits",
  "notifications",
  "predatorDebug",
]);

/** Lab sidebar: ordering, account, activity only. */
const LAB_MENU_ORDER = ["labOrders", "labAccount", "notifications"];

/** Agent sidebar: execution workflow only (Activity Center merged into Dashboard). */
const AGENT_MENU_ORDER = ["dashboard", "collections", "visits", "labs"];

/**
 * Central Menu Configuration for PrimeCare Portal
 * - Single source of truth for all pages
 * - Visibility controlled ONLY via PERMISSIONS
 * - Icons optional (can be mapped in UI layer)
 */

export const MENU_ITEMS = [
  // Core
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { key: "founderNavigation", label: "Founder Navigation", icon: "Compass" },
  { key: "founderStrategy", label: "Founder Strategy", icon: "Target" },
  { key: "founderFinancialIntelligence", label: "Financial Intelligence", icon: "BarChart3" },
  { key: "revenueFunnel", label: "Revenue Funnel", icon: "TrendingUp" },
  {
    key: "qualificationReview",
    label: "Qualification Analytics",
    icon: "ClipboardCheck",
  },
  { key: "pilotReadiness", label: "Pilot Readiness", icon: "Rocket" },
  { key: "tenantManagement", label: "Tenant Management", icon: "Building" },
  { key: "distributorManagement", label: "Distributor Management", icon: "Briefcase" },
  { key: "distributorOs", label: "Distributor OS", icon: "Building2" },
  { key: "distributorProvisioning", label: "Launch Distributor", icon: "ClipboardList" },
  { key: "commissionEngine", label: "Commission Engine", icon: "Coins" },
  { key: "labContractEngine", label: "Lab Contracts", icon: "FileText" },
  { key: "operationsCenter", label: "Operations Center", icon: "Radio" },
  { key: "accessAudit", label: "Access Audit", icon: "Shield" },

  // Field Ops
  { key: "visits", label: "Visits", icon: "ClipboardList" },
  { key: "collections", label: "Collections", icon: "Wallet" },
  { key: "labAccount", label: "Payments & Account", icon: "Wallet" },
  { key: "labs", label: "Labs", icon: "Building2" },

  // Operations
  { key: "masterCatalog", label: "Master Catalog", icon: "Package" },
  { key: "inventory", label: "Inventory", icon: "Boxes" },
  { key: "orders", label: "Orders", icon: "ShoppingCart" },

  // Finance / Risk
  { key: "risk", label: "Credit & Risk", icon: "AlertTriangle" },
  { key: "notifications", label: "Activity Center", icon: "Bell" },

  // Performance / AI
  { key: "performance", label: "Performance", icon: "BarChart3" },
  { key: "insights", label: "Insights / AI", icon: "Brain" },

  // Lab Portal
  { key: "labOrders", label: "Lab Ordering", icon: "ClipboardCheck" },
  { key: "purchase", label: "Purchase / Reorder", icon: "PackagePlus" },
  { key: "predatorDebug", label: "Predator Debug", icon: "Brain" },
  { key: "qaCommandCenter", label: "QA Command Center", icon: "ClipboardCheck" },
];

const PILOT_SAFE_PAGE_KEYS = new Set([
  "dashboard",
  "founderNavigation",
  "founderStrategy",
  "founderFinancialIntelligence",
  "revenueFunnel",
  "pilotReadiness",
  "tenantManagement",
  "distributorManagement",
  "distributorOs",
  "distributorProvisioning",
  "commissionEngine",
  "labContractEngine",
  "operationsCenter",
  "accessAudit",
  "visits",
  "collections",
  "labAccount",
  "labs",
  "masterCatalog",
  "inventory",
  "orders",
  "risk",
  "qualificationReview",
  "notifications",
  "labOrders",
  "purchase",
  "reorder",
  "predatorDebug",
  "qaCommandCenter",
]);

export function isPageVisibleInCurrentEnvironment(pageKey) {
  if (ALLOW_EXPERIMENTAL_MODULES) return true;
  if (!IS_QA && !IS_PROD) return true;
  return PILOT_SAFE_PAGE_KEYS.has(pageKey);
}

/**
 * Returns menu filtered by role
 */
export function getMenuForRole(role) {
  const normalizedRole = String(role || "").toLowerCase();
  const hqMenuKeys =
    normalizedRole === ROLES.EXECUTIVE
      ? EXECUTIVE_HQ_MENU_KEYS
      : normalizedRole === ROLES.ADMIN
        ? ADMIN_HQ_MENU_KEYS
        : null;

  const items = MENU_ITEMS.filter((item) => {
    if (item.key === "predatorDebug" && !isPredatorEnabled()) return false;
    if (item.key === "qaCommandCenter" && normalizedRole !== ROLES.EXECUTIVE) return false;
    if (normalizedRole === ROLES.LAB && !LAB_MENU_ORDER.includes(item.key)) {
      return false;
    }
    if (normalizedRole === ROLES.AGENT && !AGENT_MENU_ORDER.includes(item.key)) {
      return false;
    }
    if (hqMenuKeys && !hqMenuKeys.has(item.key)) return false;
    return (
      PERMISSIONS[item.key]?.includes(role) && isPageVisibleInCurrentEnvironment(item.key)
    );
  });

  if (normalizedRole === ROLES.LAB) {
    return [...items].sort(
      (a, b) => LAB_MENU_ORDER.indexOf(a.key) - LAB_MENU_ORDER.indexOf(b.key)
    );
  }

  if (normalizedRole === ROLES.AGENT) {
    return [...items].sort(
      (a, b) => AGENT_MENU_ORDER.indexOf(a.key) - AGENT_MENU_ORDER.indexOf(b.key)
    );
  }

  return items;
}

/**
 * Group HQ menu items into labeled sections for sidebar navigation.
 * @param {string} role
 * @returns {{ id: string, label: string, items: typeof MENU_ITEMS }[]|null}
 */
export function getMenuSectionsForRole(role) {
  const normalizedRole = String(role || "").toLowerCase();
  const flatMenu = getMenuForRole(role);
  const byKey = new Map(flatMenu.map((item) => [item.key, item]));

  let sectionDefs = null;
  if (normalizedRole === ROLES.ADMIN) sectionDefs = HQ_ADMIN_MENU_SECTIONS;
  else if (normalizedRole === ROLES.EXECUTIVE) sectionDefs = HQ_EXECUTIVE_MENU_SECTIONS;
  else return null;

  const used = new Set();
  const sections = [];

  for (const section of sectionDefs) {
    const items = [];
    for (const key of section.keys) {
      const item = byKey.get(key);
      if (item) {
        items.push(item);
        used.add(key);
      }
    }
    if (items.length > 0) {
      sections.push({ id: section.id, label: section.label, items });
    }
  }

  const remainder = flatMenu.filter((item) => !used.has(item.key));
  if (remainder.length > 0) {
    sections.push({ id: "more", label: "MORE", items: remainder });
  }

  return sections.length > 0 ? sections : null;
}

/**
 * Default landing page per role
 */
export function getDefaultPageForRole(role) {
  if (role === "lab") return "labOrders";
  const menu = getMenuForRole(role);
  return menu.length ? menu[0].key : null;
}

/**
 * Utility: Get menu item by key (used for titles / breadcrumbs)
 */
export function getMenuItem(key) {
  return MENU_ITEMS.find((item) => item.key === key);
}