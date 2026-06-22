import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { resolveAccessAuditAction } from "@/operations/accessAuditEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isPendingOrder(order = {}) {
  const s = str(order.orderStatus ?? order.status ?? order.order_status).toLowerCase();
  return s !== "fulfilled" && s !== "cancelled" && s !== "delivered";
}

const AUDIT_ALERT_TYPES = new Set([
  "deactivated",
  "password_reset",
  "role_changed",
  "distributor_changed",
  "lab_transferred",
  "lab_unassigned",
]);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build actionable HQ priority cards from existing read APIs (no mock data).
 * @param {object} bundle
 */
export function buildHqPriorityCards(bundle = {}) {
  const dashboard = bundle.dashboard || {};
  const executive = dashboard.executive || {};
  const summary = dashboard.summary || {};
  const stockStats = summary.stockStats || {};

  const criticalInventory =
    num(stockStats.criticalItems) ||
    num(executive.productsNearStockout) ||
    num(summary.stockStats?.criticalItems);

  const collSummary = summarizeCollectionsList(bundle.collections || [], summary.todayCollections);
  const collectionsAction = (bundle.collections || []).filter((c) => {
    const hold = str(c.creditHold ?? c.credit_hold).toUpperCase() === "HOLD";
    const risk = str(c.riskStatus).toLowerCase() === "high";
    return hold || risk || num(c.overdueDays) > 0;
  }).length;

  const pendingOrders = (bundle.orders || []).filter(isPendingOrder).length;
  const inactiveUsers = (bundle.directoryUsers || []).filter((u) => u.active === false).length;

  const todayStart = startOfToday();
  const auditAlerts = (bundle.auditEvents || []).filter((ev) => {
    const ts = new Date(ev.createdAt || ev.created_at || 0);
    if (!Number.isFinite(ts.getTime()) || ts < todayStart) return false;
    const action = resolveAccessAuditAction(ev);
    if (AUDIT_ALERT_TYPES.has(action.key)) return true;
    return str(ev.payload?.status).toLowerCase() === "failure";
  }).length;

  return [
    {
      id: "inventory",
      title: "Critical Inventory Issues",
      count: criticalInventory,
      severity: criticalInventory > 0 ? "critical" : "healthy",
      description:
        criticalInventory > 0
          ? `${criticalInventory} SKU(s) need immediate stock attention`
          : "Inventory levels are within healthy thresholds",
      ctaLabel: "Review Inventory",
      page: "inventory",
    },
    {
      id: "collections",
      title: "Collections Requiring Action",
      count: collectionsAction,
      severity: collectionsAction > 0 ? "attention" : "healthy",
      description:
        collectionsAction > 0
          ? `${collSummary.overdueCount ?? 0} overdue · credit holds and high-risk labs included`
          : "No overdue collections or credit holds flagged",
      ctaLabel: "Review Collections",
      page: "collections",
    },
    {
      id: "orders",
      title: "Pending Orders",
      count: pendingOrders,
      severity: pendingOrders > 5 ? "attention" : pendingOrders > 0 ? "monitor" : "healthy",
      description:
        pendingOrders > 0
          ? `${pendingOrders} order(s) awaiting fulfillment or delivery`
          : "No open orders in the pipeline",
      ctaLabel: "Review Orders",
      page: "orders",
    },
    {
      id: "users",
      title: "Inactive Users",
      count: inactiveUsers,
      severity: inactiveUsers > 0 ? "monitor" : "healthy",
      description:
        inactiveUsers > 0
          ? `${inactiveUsers} deactivated platform user(s) in directory`
          : "All provisioned users are active",
      ctaLabel: "Review Users",
      page: "operationsCenter",
    },
    {
      id: "audit",
      title: "Recent Audit Alerts",
      count: auditAlerts,
      severity: auditAlerts > 0 ? "attention" : "healthy",
      description:
        auditAlerts > 0
          ? `${auditAlerts} access change(s) logged today`
          : "No sensitive access changes today",
      ctaLabel: "Review Audit",
      page: "accessAudit",
    },
  ];
}
