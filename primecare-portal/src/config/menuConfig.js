import { PERMISSIONS } from "./permissions";
import { ROLES } from "./roles";
import {
  DISTRIBUTOR_ADMIN_MENU_KEYS,
  DISTRIBUTOR_MANAGER_MENU_ORDER,
  READ_ONLY_AUDITOR_MENU_ORDER,
} from "./rolePermissionMatrix.js";
import { ALLOW_EXPERIMENTAL_MODULES, IS_QA, IS_PROD } from "./environment";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { isQaCommandCenterEnabled } from "@/config/qaValidation.js";
import { ENTERPRISE_PAGE_LABELS } from "@/config/enterpriseCopy.js";

/** HQ Admin sidebar sections (order preserved within each group). */
export const HQ_ADMIN_MENU_SECTIONS = [
  { id: "home", label: "HOME", keys: ["dashboard"] },
  {
    id: "operations",
    label: "OPERATIONS",
    keys: ["labs", "orders", "logisticsDelivery", "risk"],
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
];

/** HQ Executive sidebar sections. */
export const HQ_EXECUTIVE_MENU_SECTIONS = [
  { id: "home", label: "HOME", keys: ["dashboard"] },
  {
    id: "founder",
    label: "FOUNDER",
    keys: ["founderFinancialIntelligence", "revenueFunnel"],
  },
  {
    id: "operations",
    label: "OPERATIONS",
    keys: ["orders", "logisticsDelivery", "risk", "operationsCenter"],
  },
  {
    id: "inventory",
    label: "INVENTORY",
    keys: ["masterCatalog", "inventory", "purchase"],
  },
  { id: "people", label: "PEOPLE", keys: ["accessAudit"] },
  { id: "growth", label: "GROWTH", keys: ["qualificationReview", "commissionEngine", "labContractEngine"] },
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
  "logisticsDelivery",
  "accessAudit",
  "masterCatalog",
  "inventory",
  "orders",
  "logisticsDelivery",
  "risk",
  "purchase",
  "commissionEngine",
  "labContractEngine",
  "predatorDebug",
  "qaCommandCenter",
]);

const ADMIN_HQ_MENU_KEYS = new Set([
  "dashboard",
  "distributorOs",
  "operationsCenter",
  "logisticsDelivery",
  "accessAudit",
  "qualificationReview",
  "masterCatalog",
  "inventory",
  "labs",
  "orders",
  "logisticsDelivery",
  "risk",
  "purchase",
  "notifications",
  "predatorDebug",
]);

/** Agent sidebar: execution workflow only (Activity Center merged into Dashboard). */
const AGENT_MENU_ORDER = ["dashboard", "collections", "visits", "labs"];

/** Lab sidebar: ordering, account — Activity Center hidden for pilot speed. */
const LAB_MENU_ORDER = ["labOrders", "labInvoices", "labAccount"];

const DISTRIBUTOR_ADMIN_MENU_KEY_SET = new Set(DISTRIBUTOR_ADMIN_MENU_KEYS);

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
  { key: "tenantManagement", label: ENTERPRISE_PAGE_LABELS.tenantManagement, icon: "Building" },
  { key: "distributorManagement", label: "Distributor Management", icon: "Briefcase" },
  { key: "distributorOs", label: "Distributor OS", icon: "Building2" },
  { key: "distributorProvisioning", label: ENTERPRISE_PAGE_LABELS.distributorProvisioning, icon: "ClipboardList" },
  { key: "commissionEngine", label: ENTERPRISE_PAGE_LABELS.commissionEngine, icon: "Coins" },
  { key: "labContractEngine", label: ENTERPRISE_PAGE_LABELS.labContractEngine, icon: "FileText" },
  { key: "operationsCenter", label: ENTERPRISE_PAGE_LABELS.operationsCenter, icon: "Radio" },
  { key: "accessAudit", label: ENTERPRISE_PAGE_LABELS.accessAudit, icon: "Shield" },

  // Field Ops
  { key: "visits", label: "Visits", icon: "ClipboardList" },
  { key: "collections", label: "Collections", icon: "Wallet" },
  { key: "labAccount", label: "Payments & Account", icon: "Wallet" },
  { key: "labs", label: "Labs", icon: "Building2" },

  // Operations
  { key: "masterCatalog", label: "Master Catalog", icon: "Package" },
  { key: "inventory", label: "Inventory", icon: "Boxes" },
  { key: "orders", label: "Orders", icon: "ShoppingCart" },
  { key: "logisticsDelivery", label: "Logistics", icon: "Truck" },

  // Finance / Risk
  { key: "risk", label: "Credit & Risk", icon: "AlertTriangle" },
  { key: "notifications", label: ENTERPRISE_PAGE_LABELS.notifications, icon: "Bell" },

  // Performance / AI
  { key: "performance", label: "Performance", icon: "BarChart3" },
  { key: "insights", label: ENTERPRISE_PAGE_LABELS.insights, icon: "Brain" },

  // Lab Portal
  { key: "labOrders", label: "Lab Ordering", icon: "ClipboardCheck" },
  { key: "labInvoices", label: "Invoice Center", icon: "FileText" },
  { key: "purchase", label: "Purchase / Reorder", icon: "PackagePlus" },
  { key: "predatorDebug", label: ENTERPRISE_PAGE_LABELS.predatorDebug, icon: "Brain" },
  { key: "qaCommandCenter", label: ENTERPRISE_PAGE_LABELS.qaCommandCenter, icon: "ClipboardCheck" },
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
  "logisticsDelivery",
  "accessAudit",
  "visits",
  "collections",
  "labAccount",
  "labs",
  "masterCatalog",
  "inventory",
  "orders",
  "logisticsDelivery",
  "risk",
  "qualificationReview",
  "notifications",
  "labOrders",
  "labInvoices",
  "purchase",
  "reorder",
  "predatorDebug",
  "qaCommandCenter",
]);

/**
 * HQ pilot sidebar — hide internal / low-value items from daily navigation.
 * Routes stay permissioned; direct URLs still work.
 */
const HQ_PILOT_SIDEBAR_HIDDEN_BY_ROLE = {
  [ROLES.EXECUTIVE]: new Set([
    "notifications",
    "founderNavigation",
    "founderStrategy",
    "pilotReadiness",
    "tenantManagement",
    "distributorOs",
    "predatorDebug",
    "qaCommandCenter",
  ]),
  [ROLES.ADMIN]: new Set(["notifications", "distributorOs", "predatorDebug"]),
  [ROLES.AGENT]: new Set(["notifications"]),
  [ROLES.LAB]: new Set(["notifications"]),
};

function isHqPilotSidebarHidden(role, pageKey) {
  if (ALLOW_EXPERIMENTAL_MODULES) return false;
  if (!IS_QA && !IS_PROD) return false;
  const hidden = HQ_PILOT_SIDEBAR_HIDDEN_BY_ROLE[role];
  return hidden?.has(pageKey) ?? false;
}

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
    if (item.key === "qaCommandCenter" && (!isQaCommandCenterEnabled() || normalizedRole !== ROLES.EXECUTIVE)) {
      return false;
    }
    if (normalizedRole === ROLES.LAB && !LAB_MENU_ORDER.includes(item.key)) {
      return false;
    }
    if (normalizedRole === ROLES.AGENT && !AGENT_MENU_ORDER.includes(item.key)) {
      return false;
    }
    if (
      normalizedRole === ROLES.DISTRIBUTOR_ADMIN &&
      !DISTRIBUTOR_ADMIN_MENU_KEY_SET.has(item.key)
    ) {
      return false;
    }
    if (
      normalizedRole === ROLES.DISTRIBUTOR_MANAGER &&
      !DISTRIBUTOR_MANAGER_MENU_ORDER.includes(item.key)
    ) {
      return false;
    }
    if (
      normalizedRole === ROLES.READ_ONLY_AUDITOR &&
      !READ_ONLY_AUDITOR_MENU_ORDER.includes(item.key)
    ) {
      return false;
    }
    if (hqMenuKeys && !hqMenuKeys.has(item.key)) return false;
    if (isHqPilotSidebarHidden(normalizedRole, item.key)) return false;
    return (
      PERMISSIONS[item.key]?.includes(normalizedRole) &&
      isPageVisibleInCurrentEnvironment(item.key)
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

  if (normalizedRole === ROLES.DISTRIBUTOR_MANAGER) {
    return [...items].sort(
      (a, b) =>
        DISTRIBUTOR_MANAGER_MENU_ORDER.indexOf(a.key) -
        DISTRIBUTOR_MANAGER_MENU_ORDER.indexOf(b.key)
    );
  }

  if (normalizedRole === ROLES.READ_ONLY_AUDITOR) {
    return [...items].sort(
      (a, b) =>
        READ_ONLY_AUDITOR_MENU_ORDER.indexOf(a.key) - READ_ONLY_AUDITOR_MENU_ORDER.indexOf(b.key)
    );
  }

  if (normalizedRole === ROLES.DISTRIBUTOR_ADMIN) {
    return [...items].sort(
      (a, b) =>
        DISTRIBUTOR_ADMIN_MENU_KEYS.indexOf(a.key) - DISTRIBUTOR_ADMIN_MENU_KEYS.indexOf(b.key)
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
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === ROLES.LAB) return "labOrders";
  if (normalizedRole === ROLES.DISTRIBUTOR_ADMIN) return "distributorOs";
  const menu = getMenuForRole(role);
  return menu.length ? menu[0].key : null;
}

/**
 * Utility: Get menu item by key (used for titles / breadcrumbs)
 */
export function getMenuItem(key) {
  return MENU_ITEMS.find((item) => item.key === key);
}