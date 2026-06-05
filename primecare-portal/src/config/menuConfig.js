import { PERMISSIONS } from "./permissions";
import { ROLES } from "./roles";
import { ALLOW_EXPERIMENTAL_MODULES, IS_QA, IS_PROD } from "./environment";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";

/** Lab sidebar: ordering, account, activity only. */
const LAB_MENU_ORDER = ["labOrders", "labAccount", "notifications"];

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
  { key: "tenantManagement", label: "Tenant Management", icon: "Building" },
  { key: "distributorManagement", label: "Distributor Management", icon: "Briefcase" },
  { key: "distributorProvisioning", label: "Launch Distributor", icon: "ClipboardList" },
  { key: "commissionEngine", label: "Commission Engine", icon: "Coins" },
  { key: "labContractEngine", label: "Lab Contracts", icon: "FileText" },
  { key: "operationsCenter", label: "Operations Center", icon: "Radio" },

  // Field Ops
  { key: "visits", label: "Visits", icon: "ClipboardList" },
  { key: "collections", label: "Collections", icon: "Wallet" },
  { key: "labAccount", label: "Payments & Account", icon: "Wallet" },
  { key: "labs", label: "Labs", icon: "Building2" },

  // Operations
  { key: "inventory", label: "Inventory", icon: "Boxes" },
  { key: "orders", label: "Orders", icon: "ShoppingCart" },

  // Finance / Risk
  { key: "risk", label: "Credit & Risk", icon: "AlertTriangle" },
  {
    key: "qualificationReview",
    label: "Qualification Review",
    icon: "ClipboardCheck",
  },
  { key: "notifications", label: "Activity Center", icon: "Bell" },

  // Performance / AI
  { key: "performance", label: "Performance", icon: "BarChart3" },
  { key: "insights", label: "Insights / AI", icon: "Brain" },

  // Lab Portal
  { key: "labOrders", label: "Lab Ordering", icon: "ClipboardCheck" },
  { key: "purchase", label: "Purchase / Reorder", icon: "PackagePlus" },
  { key: "predatorDebug", label: "Predator Debug", icon: "Brain" },
];

const PILOT_SAFE_PAGE_KEYS = new Set([
  "dashboard",
  "founderNavigation",
  "founderStrategy",
  "tenantManagement",
  "distributorManagement",
  "distributorProvisioning",
  "commissionEngine",
  "labContractEngine",
  "operationsCenter",
  "visits",
  "collections",
  "labAccount",
  "labs",
  "inventory",
  "orders",
  "risk",
  "qualificationReview",
  "notifications",
  "labOrders",
  "purchase",
  "reorder",
  "predatorDebug",
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
  const items = MENU_ITEMS.filter((item) => {
    if (item.key === "predatorDebug" && !isPredatorEnabled()) return false;
    if (normalizedRole === ROLES.LAB && !LAB_MENU_ORDER.includes(item.key)) {
      return false;
    }
    return (
      PERMISSIONS[item.key]?.includes(role) && isPageVisibleInCurrentEnvironment(item.key)
    );
  });

  if (normalizedRole === ROLES.LAB) {
    return [...items].sort(
      (a, b) => LAB_MENU_ORDER.indexOf(a.key) - LAB_MENU_ORDER.indexOf(b.key)
    );
  }

  return items;
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