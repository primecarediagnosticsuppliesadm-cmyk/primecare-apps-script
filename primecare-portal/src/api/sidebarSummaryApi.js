/**
 * Single coordinated sidebar summary — one parallel fetch batch, shared read caches.
 * Badge consumers should use this instead of issuing separate module reads.
 */
import {
  getCollectionsRead,
  getOrdersRead,
  getQualificationReviewRead,
  getStockDashboard,
} from "@/api/primecareSupabaseApi.js";
import { getNotificationEventsRead } from "@/api/notificationApi.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import { computeAccessAuditKpis, enrichAccessAuditEvent } from "@/operations/accessAuditEngine.js";
import { buildCreditRiskAttentionCards } from "@/operations/creditRiskHqEngine.js";
import { computeOrdersKpis } from "@/orders/ordersMonitorEngine.js";
import { loadExecutiveActionQueueEnrichment } from "@/operations/executiveActionQueueData.js";
import {
  buildExecutiveActionQueue,
  countOpenExecutiveActionQueueItems,
} from "@/operations/executiveActionQueueEngine.js";
import { isQualificationPipelinePending } from "@/utils/qualificationPipeline.js";
import { ROLES } from "@/config/roles.js";
import { perfLog, perfTime } from "@/utils/perfLog.js";

const SIDEBAR_SUMMARY_TTL_MS = 60_000;

/** @type {{ loadedAt: number, key: string, result: object|null }} */
let sidebarSummaryCache = { loadedAt: 0, key: "", result: null };
/** @type {Promise<object>|null} */
let sidebarSummaryInFlight = null;

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function countStockAttention(inventory = []) {
  let total = 0;
  for (const item of inventory) {
    const health = str(item.stockHealth);
    if (health === "Critical" || health === "Reorder") total += 1;
  }
  return total;
}

function countPendingNotifications(events = []) {
  return events.filter((e) => str(e.status).toLowerCase() === "pending").length;
}

function countCreditRiskAttention(collections = []) {
  const cards = buildCreditRiskAttentionCards(collections);
  return cards
    .filter((c) => c.severity === "critical" || c.severity === "attention")
    .reduce((sum, c) => sum + num(c.count), 0);
}

function countOrdersAttention(orders = []) {
  const kpis = computeOrdersKpis(orders);
  return num(kpis.placed) + num(kpis.processing) + num(kpis.pendingPayment);
}

function countAccessAuditToday(events = [], userNameById = new Map()) {
  const enriched = events.map((ev) => enrichAccessAuditEvent(ev, { userNameById }));
  const kpis = computeAccessAuditKpis(enriched);
  return kpis.eventsToday > 0 ? kpis.eventsToday : 0;
}

function countQualificationPending(rows = []) {
  return rows.filter((row) => isQualificationPipelinePending(row)).length;
}

function summaryCacheKey({ tenantId, role }) {
  return `${str(role)}:${str(tenantId)}`;
}

export function invalidateSidebarSummaryCache() {
  sidebarSummaryCache = { loadedAt: 0, key: "", result: null };
  sidebarSummaryInFlight = null;
}

/**
 * @param {{ tenantId?: string, role?: string, force?: boolean }} options
 * @returns {Promise<{
 *   orders: number,
 *   collections: number,
 *   inventory: number,
 *   qualification: number,
 *   alerts: number,
 *   navBadges: Record<string, number>
 * }>}
 */
export async function getSidebarSummary(options = {}) {
  const role = str(options.role);
  if (role !== ROLES.ADMIN && role !== ROLES.EXECUTIVE) {
    return {
      orders: 0,
      collections: 0,
      inventory: 0,
      qualification: 0,
      alerts: 0,
      navBadges: {},
    };
  }

  const tenantId = str(options.tenantId);
  const force = options.force === true;
  const cacheKey = summaryCacheKey({ tenantId, role });

  if (!force && sidebarSummaryInFlight) {
    perfLog("getSidebarSummary.inFlightJoin");
    return sidebarSummaryInFlight;
  }
  if (
    !force &&
    sidebarSummaryCache.result &&
    sidebarSummaryCache.key === cacheKey &&
    Date.now() - sidebarSummaryCache.loadedAt < SIDEBAR_SUMMARY_TTL_MS
  ) {
    perfLog("getSidebarSummary.cacheHit", {
      ageMs: Date.now() - sidebarSummaryCache.loadedAt,
    });
    return sidebarSummaryCache.result;
  }

  const endTotal = perfTime("getSidebarSummary.total");

  const run = async () => {
    const [stockRes, ordersRes, collectionsRes, qualRes, notifyRes, auditRes, enrich] =
      await Promise.all([
        getStockDashboard(),
        getOrdersRead(),
        getCollectionsRead(),
        getQualificationReviewRead(),
        tenantId
          ? getNotificationEventsRead({ tenantId, limit: 80 })
          : Promise.resolve({ success: true, data: [] }),
        tenantId
          ? getUserProvisioningEventsRead({ tenantId, limit: 120 })
          : Promise.resolve({ success: true, data: { events: [] } }),
        loadExecutiveActionQueueEnrichment(
          { tenantId, tenant_id: tenantId, role },
          { commissionLimit: 15, qualificationLimit: 12 }
        ).catch(() => null),
      ]);

    const notifyEvents = Array.isArray(notifyRes?.data) ? notifyRes.data : [];
    const activityCount = countPendingNotifications(notifyEvents);

    const auditEvents = auditRes?.data?.events || [];
    const auditCount = countAccessAuditToday(auditEvents);

    const orders =
      ordersRes?.success !== false && Array.isArray(ordersRes?.data?.orders)
        ? ordersRes.data.orders
        : [];
    const ordersCount = ordersRes?.success !== false ? countOrdersAttention(orders) : 0;

    const collections = collectionsRes?.data?.collections || [];
    const collectionsCount = countCreditRiskAttention(collections);

    const inventory = stockRes?.data?.inventory || [];
    const inventoryCount = countStockAttention(inventory);

    const qualRows = Array.isArray(qualRes?.data) ? qualRes.data : [];
    const qualificationCount = countQualificationPending(qualRows);

    let actionQueueOpen = 0;
    if (enrich?.payload) {
      const queue = buildExecutiveActionQueue({
        payload: enrich.payload,
        contracts: enrich.contracts || [],
        pendingCommissions: enrich.pendingCommissions || [],
        tenantId,
      });
      actionQueueOpen = countOpenExecutiveActionQueueItems(queue.items);
    }

    const alerts = activityCount + auditCount + (actionQueueOpen > 0 ? actionQueueOpen : 0);

    const navBadges = {};
    if (activityCount > 0) navBadges.notifications = activityCount;
    if (auditCount > 0) navBadges.accessAudit = auditCount;
    if (ordersCount > 0) navBadges.orders = ordersCount;
    if (collectionsCount > 0) navBadges.risk = collectionsCount;
    if (inventoryCount > 0) navBadges.inventory = inventoryCount;
    if (qualificationCount > 0) navBadges.qualificationReview = qualificationCount;
    if (actionQueueOpen > 0) navBadges.dashboard = actionQueueOpen;

    const result = {
      orders: ordersCount,
      collections: collectionsCount,
      inventory: inventoryCount,
      qualification: qualificationCount,
      alerts,
      navBadges,
    };

    if (!force) {
      sidebarSummaryCache = { loadedAt: Date.now(), key: cacheKey, result };
    }
    endTotal({ orders: ordersCount, collections: collectionsCount, alerts });
    return result;
  };

  if (!force) sidebarSummaryInFlight = run();
  try {
    return await (force ? run() : sidebarSummaryInFlight);
  } finally {
    if (!force) sidebarSummaryInFlight = null;
  }
}
