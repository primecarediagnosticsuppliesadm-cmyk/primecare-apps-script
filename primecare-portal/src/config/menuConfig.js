import { PERMISSIONS } from "./permissions";

/**
 * Central Menu Configuration for PrimeCare Portal
 * - Single source of truth for all pages
 * - Visibility controlled ONLY via PERMISSIONS
 * - Icons optional (can be mapped in UI layer)
 */

export const MENU_ITEMS = [
  // Core
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },

  // Field Ops
  { key: "visits", label: "Visits", icon: "ClipboardList" },
  { key: "collections", label: "Collections", icon: "Wallet" },
  { key: "labs", label: "Labs", icon: "Building2" },

  // Operations
  { key: "inventory", label: "Inventory", icon: "Boxes" },
  { key: "orders", label: "Orders", icon: "ShoppingCart" },

  // Finance / Risk
  { key: "risk", label: "Credit & Risk", icon: "AlertTriangle" },

  // Performance / AI
  { key: "performance", label: "Performance", icon: "BarChart3" },
  { key: "insights", label: "Insights / AI", icon: "Brain" },

  // Lab Portal
  { key: "labOrders", label: "Lab Ordering", icon: "ClipboardCheck" },
  { key: "purchase", label: "Purchase / Reorder", icon: "PackagePlus" },

   
];

/**
 * Returns menu filtered by role
 */
export function getMenuForRole(role) {
  return MENU_ITEMS.filter(
    (item) => PERMISSIONS[item.key]?.includes(role)
  );
}

/**
 * Default landing page per role
 */
export function getDefaultPageForRole(role) {
  const menu = getMenuForRole(role);
  return menu.length ? menu[0].key : null;
}

/**
 * Utility: Get menu item by key (used for titles / breadcrumbs)
 */
export function getMenuItem(key) {
  return MENU_ITEMS.find((item) => item.key === key);
}