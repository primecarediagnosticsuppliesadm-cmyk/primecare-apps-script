/**
 * Idle-time route chunk prefetch — warms likely next pages without blocking first paint.
 */
import { ROLES } from "@/config/roles.js";

const PREFETCH_BY_ROLE = {
  [ROLES.EXECUTIVE]: {
    dashboard: ["orders", "risk", "operationsCenter", "qualificationReview"],
    orders: ["collections", "risk"],
    risk: ["collections", "orders"],
    operationsCenter: ["orders", "accessAudit"],
  },
  [ROLES.ADMIN]: {
    dashboard: ["orders", "labs", "visits", "inventory"],
    orders: ["labs", "collections"],
    labs: ["orders", "visits"],
    inventory: ["masterCatalog", "purchase"],
  },
  [ROLES.AGENT]: {
    dashboard: ["collections", "visits", "labs"],
    collections: ["visits", "labs"],
  },
  [ROLES.LAB]: {
    labOrders: ["labInvoices", "labAccount"],
    labInvoices: ["labOrders"],
  },
};

/** @type {Record<string, () => Promise<unknown>>} */
const PAGE_LOADERS = {
  orders: () => import("@/pages/OrdersPage.jsx"),
  collections: () => import("@/pages/CollectionsPage.jsx"),
  risk: () => import("@/pages/CollectionsPage.jsx"),
  inventory: () => import("@/pages/StockPage.jsx"),
  labs: () => import("@/pages/LabsPage.jsx"),
  visits: () => import("@/pages/AgentVisitPage.jsx"),
  operationsCenter: () => import("@/pages/OperationsCommandCenter.jsx"),
  qualificationReview: () => import("@/pages/QualificationReviewPage.jsx"),
  accessAudit: () => import("@/pages/AccessAuditPage.jsx"),
  masterCatalog: () => import("@/pages/MasterCatalogPage.jsx"),
  purchase: () => import("@/pages/PurchaseOrdersPage.jsx"),
  labOrders: () => import("@/pages/LabOrderingPage.jsx"),
  labInvoices: () => import("@/pages/LabInvoiceCenterPage.jsx"),
  labAccount: () => import("@/pages/LabOrderingPage.jsx"),
};

function resolvePageLoader(role, pageKey) {
  const r = String(role || "").toLowerCase();
  const key = String(pageKey || "").trim();
  if (key === "dashboard") {
    if (r === ROLES.EXECUTIVE) return () => import("@/pages/ExecutiveControlTower.jsx");
    if (r === ROLES.AGENT) return () => import("@/pages/AgentDashboard.jsx");
    return () => import("@/pages/AdminDashboard.jsx");
  }
  return PAGE_LOADERS[key];
}

const prefetched = new Set();

function scheduleIdle(fn) {
  if (typeof window === "undefined") return;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => fn(), { timeout: 2500 });
    return;
  }
  window.setTimeout(fn, 400);
}

/**
 * Prefetch route chunks for likely next pages (non-blocking).
 * @param {string} role
 * @param {string} activePage
 */
export function prefetchLikelyRoutes(role, activePage) {
  if (typeof window === "undefined") return;
  const roleMap = PREFETCH_BY_ROLE[String(role || "").toLowerCase()];
  const targets = roleMap?.[activePage];
  if (!targets?.length) return;

  scheduleIdle(() => {
    for (const key of targets) {
      const cacheKey = `${role}:${key}`;
      if (prefetched.has(cacheKey)) continue;
      const loader = resolvePageLoader(role, key);
      if (!loader) continue;
      prefetched.add(cacheKey);
      void loader().catch(() => {
        prefetched.delete(cacheKey);
      });
    }
  });
}

/**
 * Prefetch a single page chunk (e.g. sidebar hover).
 * @param {string} role
 * @param {string} pageKey
 */
export function prefetchRoute(role, pageKey) {
  const cacheKey = `${role}:${pageKey}`;
  if (prefetched.has(cacheKey)) return;
  const loader = resolvePageLoader(role, pageKey);
  if (!loader) return;
  prefetched.add(cacheKey);
  void loader().catch(() => {
    prefetched.delete(cacheKey);
  });
}
