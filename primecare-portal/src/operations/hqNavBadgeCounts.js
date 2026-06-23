import {
  getCollectionsRead,
  getOrdersRead,
  getStockDashboard,
} from "@/api/primecareSupabaseApi.js";
import { getNotificationEventsRead } from "@/api/notificationApi.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import { computeAccessAuditKpis, enrichAccessAuditEvent } from "@/operations/accessAuditEngine.js";
import { buildCreditRiskAttentionCards } from "@/operations/creditRiskHqEngine.js";
import { computeOrdersKpis } from "@/orders/ordersMonitorEngine.js";
import { ROLES } from "@/config/roles.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function countStockAttention(inventory = []) {
  let critical = 0;
  let reorder = 0;
  for (const item of inventory) {
    const health = str(item.stockHealth);
    if (health === "Critical") critical += 1;
    else if (health === "Reorder") reorder += 1;
  }
  const total = critical + reorder;
  return total > 0 ? total : 0;
}

function countPendingNotifications(events = []) {
  return events.filter((e) => str(e.status).toLowerCase() === "pending").length;
}

function countCreditRiskAttention(collections = []) {
  const cards = buildCreditRiskAttentionCards(collections);
  const total = cards
    .filter((c) => c.severity === "critical" || c.severity === "attention")
    .reduce((sum, c) => sum + num(c.count), 0);
  return total > 0 ? total : 0;
}

function countOrdersAttention(orders = []) {
  const kpis = computeOrdersKpis(orders);
  const total = num(kpis.placed) + num(kpis.processing) + num(kpis.pendingPayment);
  return total > 0 ? total : 0;
}

function countAccessAuditToday(events = [], userNameById = new Map()) {
  const enriched = events.map((ev) =>
    enrichAccessAuditEvent(ev, { userNameById })
  );
  const kpis = computeAccessAuditKpis(enriched);
  return kpis.eventsToday > 0 ? kpis.eventsToday : 0;
}

/**
 * Lightweight HQ nav badge counts from existing read APIs (no new tables).
 * Returns only positive counts — omit keys when zero.
 * @param {{ tenantId?: string, role?: string }} options
 */
export async function loadHqNavBadgeCounts(options = {}) {
  const role = str(options.role);
  if (role !== ROLES.ADMIN && role !== ROLES.EXECUTIVE) {
    return {};
  }

  const tenantId = str(options.tenantId);
  const [stockRes, ordersRes, collectionsRes, notifyRes, auditRes] = await Promise.all([
    getStockDashboard(),
    getOrdersRead(),
    getCollectionsRead(),
    tenantId
      ? getNotificationEventsRead({ tenantId, limit: 80 })
      : Promise.resolve({ success: true, data: [] }),
    tenantId
      ? getUserProvisioningEventsRead({ tenantId, limit: 120 })
      : Promise.resolve({ success: true, data: { events: [] } }),
  ]);

  const badges = {};

  const notifyEvents = Array.isArray(notifyRes?.data) ? notifyRes.data : [];
  const activityCount = countPendingNotifications(notifyEvents);
  if (activityCount > 0) badges.notifications = activityCount;

  const auditEvents = auditRes?.data?.events || [];
  const auditCount = countAccessAuditToday(auditEvents);
  if (auditCount > 0) badges.accessAudit = auditCount;

  const orders = ordersRes?.data?.orders || [];
  const ordersCount = countOrdersAttention(orders);
  if (ordersCount > 0) badges.orders = ordersCount;

  const collections = collectionsRes?.data?.collections || [];
  const riskCount = countCreditRiskAttention(collections);
  if (riskCount > 0) badges.risk = riskCount;

  const inventory = stockRes?.data?.inventory || [];
  const inventoryCount = countStockAttention(inventory);
  if (inventoryCount > 0) badges.inventory = inventoryCount;

  return badges;
}
