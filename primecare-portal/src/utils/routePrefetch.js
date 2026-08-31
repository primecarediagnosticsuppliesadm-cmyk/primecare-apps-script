/**
 * Idle-time route chunk prefetch — warms likely next pages without blocking first paint.
 */
import { ROLES } from "@/config/roles.js";
import { prefetchSharedRouteData } from "@/api/sharedReadBroker.js";

export const PREFETCH_BY_ROLE = {
  [ROLES.EXECUTIVE]: {
    dashboard: ["executiveFinancialIntelligence", "compensationPayroll", "operationsCenter"],
    executiveFinancialIntelligence: ["compensationPayroll", "operationsCenter"],
    compensationPayroll: ["executiveFinancialIntelligence", "operationsCenter"],
    operationsCenter: ["executiveFinancialIntelligence", "projectionOpsCenter"],
    projectionOpsCenter: ["executiveFinancialIntelligence", "operationsCenter"],
  },
  [ROLES.ADMIN]: {
    dashboard: ["orders", "labs", "collections", "logisticsDelivery"],
    orders: ["labs", "collections", "logisticsDelivery"],
    labs: ["orders", "collections", "logisticsDelivery"],
    collections: ["orders", "labs", "logisticsDelivery"],
    logisticsDelivery: ["orders", "labs", "collections"],
  },
  [ROLES.AGENT]: {
    dashboard: ["collections", "visits"],
    collections: ["dashboard", "visits"],
    visits: ["dashboard", "collections"],
  },
  [ROLES.LAB]: {
    labOrders: ["labInvoices"],
    labInvoices: ["labOrders"],
  },
};

/** @type {Record<string, () => Promise<unknown>>} */
export const PAGE_LOADERS = {
  orders: () => import("@/pages/OrdersPage.jsx"),
  logisticsDelivery: () => import("@/pages/LogisticsDeliveryPage.jsx"),
  collections: () => import("@/pages/CollectionsPage.jsx"),
  risk: () => import("@/pages/CollectionsPage.jsx"),
  inventory: () => import("@/pages/StockPage.jsx"),
  labs: () => import("@/pages/LabsPage.jsx"),
  visits: () => import("@/pages/AgentVisitPage.jsx"),
  operationsCenter: () => import("@/pages/OperationsCommandCenter.jsx"),
  executiveFinancialIntelligence: () => import("@/pages/ExecutiveFinancialIntelligencePage.jsx"),
  compensationPayroll: () => import("@/pages/ExecutiveCompensationCenterPage.jsx"),
  projectionOpsCenter: () => import("@/pages/ProjectionOperationsCenterPage.jsx"),
  qualificationReview: () => import("@/pages/QualificationReviewPage.jsx"),
  accessAudit: () => import("@/pages/AccessAuditPage.jsx"),
  masterCatalog: () => import("@/pages/MasterCatalogPage.jsx"),
  purchase: () => import("@/pages/PurchaseOrdersPage.jsx"),
  labOrders: () => import("@/pages/LabOrderingPage.jsx"),
  labInvoices: () => import("@/pages/LabInvoiceCenterPage.jsx"),
  labAccount: () => import("@/pages/LabOrderingPage.jsx"),
  agentResources: () => import("@/pages/AgentResourcesPublisherPage.jsx"),
};

function resolvePageLoader(role, pageKey) {
  const r = String(role || "").toLowerCase();
  const key = String(pageKey || "").trim();
  if (key === "dashboard") {
    if (r === ROLES.EXECUTIVE) return () => import("@/pages/ExecutiveControlTower.jsx");
    if (r === ROLES.AGENT) return () => import("@/pages/AgentDashboard.jsx");
    return () => import("@/pages/AdminDashboard.jsx");
  }
  if (key === "agentResources") {
    if (r === ROLES.AGENT) return () => import("@/pages/AgentResourcesPage.jsx");
    return () => import("@/pages/AgentResourcesPublisherPage.jsx");
  }
  return PAGE_LOADERS[key];
}

const prefetched = new Set();
let stableRouteTimer = null;

function scheduleIdle(fn, timeout = 2500) {
  if (typeof window === "undefined") return () => {};
  let cancelled = false;
  const run = () => {
    if (!cancelled) fn();
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(run, 400);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
}

function scheduleAfterStableRoute(fn, stableMs = 650) {
  if (typeof window === "undefined") return;
  if (stableRouteTimer != null) {
    window.clearTimeout(stableRouteTimer);
  }
  stableRouteTimer = window.setTimeout(() => {
    stableRouteTimer = null;
    scheduleIdle(fn);
  }, stableMs);
}

/**
 * Prefetch route chunks for likely next pages (non-blocking).
 * @param {string} role
 * @param {string} activePage
 * @param {object|null} [currentUser]
 */
export function prefetchLikelyRoutes(role, activePage, currentUser = null) {
  if (typeof window === "undefined") return;
  const roleMap = PREFETCH_BY_ROLE[String(role || "").toLowerCase()];
  const targets = roleMap?.[activePage];
  if (!targets?.length) return;

  scheduleAfterStableRoute(() => {
    for (const key of targets) {
      const cacheKey = `${role}:${key}`;
      if (prefetched.has(cacheKey)) continue;
      const loader = resolvePageLoader(role, key);
      if (!loader) continue;
      prefetched.add(cacheKey);
      void loader().catch(() => {
        prefetched.delete(cacheKey);
      });
      prefetchSharedRouteData(role, key, currentUser);
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
