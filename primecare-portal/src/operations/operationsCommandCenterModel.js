import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { productsNearStockoutFromInventoryStats } from "@/metrics/computeInventoryMetrics.js";

const ATTENTION_SEVERITY_ORDER = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };
const RISK_LEVEL_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(raw) {
  const s = String(raw || "").trim().slice(0, 10);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysSince(iso) {
  const d = parseYmd(iso);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function normalizeOrderStatus(status) {
  return String(status || "Placed").trim();
}

function isOrderDelayed(order) {
  const status = normalizeOrderStatus(order.orderStatus).toLowerCase();
  if (status === "fulfilled" || status === "cancelled" || status === "delivered") return false;
  const placed = parseYmd(order.orderDate || order.createdAt);
  if (!placed) return false;
  const age = daysSince(placed.toISOString().slice(0, 10));
  return age != null && age >= 3;
}

/**
 * @param {object} payload
 */
export function buildOperationalLabSnapshot(payload, labId) {
  const key = String(labId || "").trim();
  const collection = (payload.collections || []).find((c) => String(c.labId) === key) || null;
  const orders = (payload.orders || [])
    .filter((o) => String(o.labId) === key)
    .slice(0, 8);
  const visits = (payload.visits || [])
    .filter((v) => String(v.labId || v.lab_id) === key)
    .slice(0, 6);
  const risk = (payload.riskLabs || []).find((r) => String(r.labId) === key) || null;

  return {
    labId: key,
    labName: collection?.labName || orders[0]?.labName || risk?.labName || key,
    collection,
    orders,
    visits,
    risk,
    outstanding: Number(collection?.outstandingAmount ?? 0),
    overdueDays: Number(collection?.overdueDays ?? 0),
    paymentStatus: collection?.paymentStatus || "—",
    riskLevel: risk?.level || collection?.riskStatus || "—",
    area: collection?.area || "",
    stage: risk?.qualificationLabel || "",
  };
}

/**
 * Deterministic lab risk (no AI).
 */
export function computeLabOperationalRisk(collection, visitsForLab = []) {
  const overdue = Number(collection?.overdueDays ?? 0);
  const outstanding = Number(collection?.outstandingAmount ?? 0);
  const riskStatus = String(collection?.riskStatus || "").toLowerCase();
  const payment = String(collection?.paymentStatus || "").toLowerCase();

  let score = 0;
  const drivers = [];

  if (overdue >= 30) {
    score += 35;
    drivers.push(`${overdue} days overdue`);
  } else if (overdue >= 14) {
    score += 25;
    drivers.push(`${overdue} days overdue`);
  } else if (overdue > 0) {
    score += 12;
    drivers.push("Payment past due");
  }

  if (outstanding >= 500000) {
    score += 20;
    drivers.push(`High exposure ${formatCurrency(outstanding)}`);
  } else if (outstanding >= 100000) {
    score += 10;
    drivers.push(`Exposure ${formatCurrency(outstanding)}`);
  }

  if (riskStatus === "high" || payment.includes("overdue")) {
    score += 18;
    drivers.push("High collection risk flag");
  } else if (riskStatus === "medium") {
    score += 8;
  }

  const lastVisit = visitsForLab[0];
  const visitAge = lastVisit ? daysSince(lastVisit.visitDate || lastVisit.date) : null;
  if (visitAge == null || visitAge >= 21) {
    score += 15;
    drivers.push(visitAge == null ? "No recent visit on record" : `No visit in ${visitAge} days`);
  } else if (visitAge >= 14) {
    score += 8;
    drivers.push(`Last visit ${visitAge} days ago`);
  }

  let level = "Low";
  if (score >= 55) level = "Critical";
  else if (score >= 38) level = "High";
  else if (score >= 20) level = "Medium";

  return { level, score, drivers: drivers.slice(0, 4) };
}

function makeAttentionItem(item) {
  return {
    id: item.id,
    severity: item.severity,
    title: item.title,
    subtitle: item.subtitle,
    explanation: item.explanation,
    ageLabel: item.ageLabel || "Today",
    labId: item.labId || "",
    labName: item.labName || "",
    orderId: item.orderId || "",
    action: item.action,
    actionLabel: item.actionLabel,
  };
}

/**
 * @param {import('./operationsCommandCenterLoader.js').OperationsPayload} payload
 */
export function buildAttentionQueue(payload) {
  const items = [];
  const todayYmd = localDateYmd();

  for (const c of payload.collections || []) {
    const overdue = Number(c.overdueDays || 0);
    const outstanding = Number(c.outstandingAmount || 0);
    if (overdue >= 14 && outstanding > 0) {
      items.push(
        makeAttentionItem({
          id: `coll-critical-${c.labId}`,
          severity: "CRITICAL",
          title: "Overdue collection",
          subtitle: c.labName || c.labId,
          explanation: `${formatCurrency(outstanding)} outstanding · ${overdue} days overdue`,
          ageLabel: `${overdue}d overdue`,
          labId: c.labId,
          labName: c.labName,
          action: "collections",
          actionLabel: "View Collections",
        })
      );
    } else if (overdue > 0 && outstanding > 0) {
      items.push(
        makeAttentionItem({
          id: `coll-attn-${c.labId}`,
          severity: "ATTENTION",
          title: "Collection due",
          subtitle: c.labName || c.labId,
          explanation: `${formatCurrency(outstanding)} needs follow-up`,
          ageLabel: `${overdue}d`,
          labId: c.labId,
          labName: c.labName,
          action: "collections",
          actionLabel: "View Collections",
        })
      );
    }
    if (String(c.riskStatus || "").toLowerCase() === "high") {
      items.push(
        makeAttentionItem({
          id: `risk-${c.labId}`,
          severity: "ATTENTION",
          title: "High-risk account",
          subtitle: c.labName || c.labId,
          explanation: "Credit / collection risk elevated",
          labId: c.labId,
          labName: c.labName,
          action: "lab",
          actionLabel: "Open Lab",
        })
      );
    }
  }

  for (const order of payload.orders || []) {
    if (!isOrderDelayed(order)) continue;
    const age = daysSince(order.orderDate || order.createdAt);
    items.push(
      makeAttentionItem({
        id: `order-delay-${order.orderId}`,
        severity: age != null && age >= 7 ? "CRITICAL" : "ATTENTION",
        title: "Delayed order",
        subtitle: order.labName || order.orderId,
        explanation: `Status ${normalizeOrderStatus(order.orderStatus)} · ${formatCurrency(order.orderTotal)}`,
        ageLabel: age != null ? `${age}d` : "—",
        labId: order.labId,
        labName: order.labName,
        orderId: order.orderId,
        action: "orders",
        actionLabel: "Open Order",
      })
    );
  }

  for (const row of payload.inventory || []) {
    const health = String(row.stockHealth || row.status || "").toLowerCase();
    if (health.includes("critical") || Number(row.currentStock) <= 0) {
      items.push(
        makeAttentionItem({
          id: `inv-${row.productId}`,
          severity: "CRITICAL",
          title: "Critical stock",
          subtitle: row.productName || row.productId,
          explanation: `On hand ${row.currentStock ?? 0} · reorder ${row.reorderQty ?? 0}`,
          action: "inventory",
          actionLabel: "View Inventory",
        })
      );
    } else if (health.includes("reorder") || health.includes("low")) {
      items.push(
        makeAttentionItem({
          id: `inv-low-${row.productId}`,
          severity: "MONITORING",
          title: "Low inventory",
          subtitle: row.productName || row.productId,
          explanation: `Stock ${row.currentStock ?? 0} below target`,
          action: "inventory",
          actionLabel: "View Inventory",
        })
      );
    }
  }

  for (const po of payload.purchaseOrders || []) {
    const status = String(po.status || po.poStatus || "").toLowerCase();
    if (status.includes("pending") || status.includes("open") || status.includes("draft")) {
      items.push(
        makeAttentionItem({
          id: `po-${po.poId || po.id}`,
          severity: "MONITORING",
          title: "Procurement pending",
          subtitle: po.supplierName || po.poId || "PO",
          explanation: `PO status: ${po.status || "Pending"}`,
          action: "purchase",
          actionLabel: "View Procurement",
        })
      );
    }
  }

  for (const c of payload.collections || []) {
    const followUp = parseYmd(c.nextFollowUp);
    if (followUp && followUp.getTime() <= new Date(todayYmd).getTime()) {
      items.push(
        makeAttentionItem({
          id: `followup-${c.labId}`,
          severity: "ATTENTION",
          title: "Follow-up due",
          subtitle: c.labName || c.labId,
          explanation: c.nextAction || "Scheduled follow-up is due",
          labId: c.labId,
          labName: c.labName,
          action: "visits",
          actionLabel: "Assign Follow-up",
        })
      );
    }
  }

  items.sort(
    (a, b) =>
      (ATTENTION_SEVERITY_ORDER[a.severity] ?? 9) - (ATTENTION_SEVERITY_ORDER[b.severity] ?? 9)
  );

  return items.slice(0, 24);
}

const FEED_EVENT_ICONS = {
  order_created: "order",
  order_fulfilled: "order",
  payment_received: "payment",
  collection_due: "payment",
  visit: "visit",
};

/**
 * @param {import('./operationsCommandCenterLoader.js').OperationsPayload} payload
 */
export function buildOperationsFeed(payload, limit = 30) {
  const feed = [];

  for (const row of payload.notifications || []) {
    const type = String(row.event_type || "").toLowerCase();
    const payloadJson =
      row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
    feed.push({
      id: row.event_id || `evt-${row.created_at}`,
      kind: FEED_EVENT_ICONS[type] || "ops",
      title: type.replaceAll("_", " ") || "Operational update",
      subtitle: String(payloadJson.message || row.source_module || "").slice(0, 120),
      labName: payloadJson.labName || payloadJson.lab_name || "",
      labId: payloadJson.labId || payloadJson.lab_id || "",
      createdAt: row.created_at,
      severity: String(row.severity || "info").toLowerCase(),
    });
  }

  for (const v of (payload.visits || []).slice(0, 12)) {
    feed.push({
      id: `visit-${v.id || v.visitId}-${v.visitDate}`,
      kind: "visit",
      title: "Visit completed",
      subtitle: `${v.visitType || "Visit"} · ${v.labName || ""}`,
      labName: v.labName,
      labId: v.labId,
      createdAt: v.visitDate,
      severity: "info",
    });
  }

  feed.sort((a, b) => {
    const tb = Date.parse(b.createdAt || "") || 0;
    const ta = Date.parse(a.createdAt || "") || 0;
    return tb - ta;
  });

  return feed.slice(0, limit);
}

export function buildInventoryRiskPanel(payload) {
  const inventory = payload.inventory || [];
  const reorder = payload.reorderCandidates || [];
  const critical = inventory.filter(
    (r) =>
      String(r.stockHealth || "").toLowerCase().includes("critical") ||
      Number(r.currentStock) <= 0
  );
  const low = inventory.filter((r) => {
    const h = String(r.stockHealth || "").toLowerCase();
    return h.includes("reorder") || h.includes("low");
  });
  const urgentForecast = reorder.filter((r) => {
    const u = String(r.urgency || "").toLowerCase();
    return u === "critical" || u === "high";
  });

  const pendingPo = (payload.purchaseOrders || []).filter((po) => {
    const s = String(po.status || "").toLowerCase();
    return s.includes("pending") || s.includes("open");
  });

  return {
    belowReorder: low.slice(0, 8),
    critical: critical.slice(0, 8),
    urgentForecast: urgentForecast.slice(0, 6),
    pendingReceipts: pendingPo.slice(0, 6),
    highMovement: inventory
      .filter((r) => Number(r.reorderQty) > 0)
      .sort((a, b) => Number(b.reorderQty) - Number(a.reorderQty))
      .slice(0, 6),
  };
}

export function buildAgentOperationsPanel(payload) {
  const summary = payload.dashboard?.summary || {};
  const executive = payload.dashboard?.executive || {};
  const todayYmd = localDateYmd();
  const visitsToday = (payload.visits || []).filter(
    (v) => String(v.visitDate || v.date || "").slice(0, 10) === todayYmd
  ).length;

  const collSummary = summarizeCollectionsList(payload.collections || []);
  const totalRecovered = (payload.collections || []).reduce(
    (s, c) => s + Number(c.totalPaid || 0),
    0
  );
  const followUpsDue = (payload.collections || []).filter((c) => {
    const d = parseYmd(c.nextFollowUp);
    return d && d.getTime() <= new Date(todayYmd).getTime();
  }).length;

  const agents = new Map();
  for (const v of payload.visits || []) {
    const name = String(v.agent || v.agentName || "").trim() || "Unknown";
    const row = agents.get(name) || { name, visits: 0, sold: 0 };
    row.visits += 1;
    row.sold += Number(v.soldValue || 0);
    agents.set(name, row);
  }

  const agentRows = [...agents.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8);

  return {
    visitsToday: visitsToday || Number(summary.recentVisits ?? 0),
    collectionsRecovered: formatCurrency(
      totalRecovered || executive.todaysRevenue || 0
    ),
    missedFollowUps: followUpsDue,
    overdueCollections: collSummary.overdueCount,
    agentRows,
    healthLabel:
      followUpsDue > 5 ? "Needs coaching" : visitsToday > 0 ? "Active field day" : "Quiet day",
  };
}

export function buildFinancialPressurePanel(payload) {
  const collSummary = summarizeCollectionsList(payload.collections || []);
  const executive = payload.dashboard?.executive || {};
  const blocked = (payload.collections || []).filter((c) => {
    const pay = String(c.paymentStatus || "").toLowerCase();
    return pay.includes("overdue") || Number(c.overdueDays) > 30;
  });

  const topDebtors = [...(payload.collections || [])]
    .sort((a, b) => Number(b.outstandingAmount) - Number(a.outstandingAmount))
    .slice(0, 8);

  const totalPaid = (payload.collections || []).reduce(
    (s, c) => s + Number(c.totalPaid || 0),
    0
  );
  const totalOutstanding = collSummary.totalOutstanding || executive.outstandingReceivables || 0;
  const recoveryPct =
    totalPaid + totalOutstanding > 0
      ? Math.round((totalPaid / (totalPaid + totalOutstanding)) * 100)
      : null;

  return {
    totalOverdue: formatCurrency(
      (payload.collections || [])
        .filter((c) => Number(c.overdueDays) > 0)
        .reduce((s, c) => s + Number(c.outstandingAmount || 0), 0)
    ),
    blockedCount: blocked.length,
    topDebtors,
    totalOutstanding: formatCurrency(totalOutstanding),
    recoveryPct,
    todayCollections: formatCurrency(
      Number(payload.dashboard?.summary?.todayCollections ?? 0)
    ),
  };
}

export function buildOperationalHealth(payload) {
  const collSummary = summarizeCollectionsList(payload.collections || []);
  const stockStats = payload.dashboard?.summary?.stockStats || {};
  const totalLabs = (payload.collections || []).length;
  const overduePct =
    totalLabs > 0 ? Math.round((collSummary.overdueCount / totalLabs) * 100) : 0;

  const orders = payload.orders || [];
  const openOrders = orders.filter((o) => {
    const s = normalizeOrderStatus(o.orderStatus).toLowerCase();
    return s !== "fulfilled" && s !== "cancelled";
  });
  const delayedOrders = openOrders.filter(isOrderDelayed);
  const fulfillmentPct =
    openOrders.length > 0
      ? Math.round(((openOrders.length - delayedOrders.length) / openOrders.length) * 100)
      : 100;

  const nearStockout = productsNearStockoutFromInventoryStats(stockStats);
  const totalSkus = Number(stockStats.totalSkus || payload.inventory?.length || 1);
  const inventoryHealth = Math.max(
    0,
    Math.round(100 - (nearStockout / Math.max(totalSkus, 1)) * 100)
  );

  const visitsScore = Math.min(100, Number(payload.dashboard?.summary?.recentVisits ?? 0) * 8);
  const collectionsHealth = Math.max(0, 100 - overduePct * 1.2);
  const fulfillmentHealth = fulfillmentPct;

  const score = Math.round(
    collectionsHealth * 0.3 +
      fulfillmentHealth * 0.25 +
      inventoryHealth * 0.2 +
      visitsScore * 0.15 +
      Math.max(0, 100 - overduePct) * 0.1
  );

  const drivers = [];
  if (overduePct > 20) drivers.push({ label: "Overdue accounts", impact: "negative" });
  if (delayedOrders.length > 0) {
    drivers.push({ label: `${delayedOrders.length} delayed orders`, impact: "negative" });
  }
  if (nearStockout > 0) {
    drivers.push({ label: `${nearStockout} SKUs near stockout`, impact: "negative" });
  }
  if (collSummary.overdueCount === 0) {
    drivers.push({ label: "Collections current", impact: "positive" });
  }

  const trend =
    score >= 75 ? "stable" : score >= 55 ? "watch" : "pressure";

  return {
    score: Math.min(100, Math.max(0, score)),
    trend,
    drivers: drivers.slice(0, 5),
    contributors: {
      collectionsHealth: Math.round(collectionsHealth),
      fulfillmentHealth: Math.round(fulfillmentHealth),
      inventoryHealth: Math.round(inventoryHealth),
      visitsScore: Math.round(visitsScore),
    },
  };
}

export function buildRiskLabs(payload) {
  const visitsByLab = new Map();
  for (const v of payload.visits || []) {
    const lid = String(v.labId || "").trim();
    if (!lid) continue;
    const list = visitsByLab.get(lid) || [];
    list.push(v);
    visitsByLab.set(lid, list);
  }

  const rows = (payload.collections || []).map((c) => {
    const labVisits = visitsByLab.get(String(c.labId)) || [];
    const risk = computeLabOperationalRisk(c, labVisits);
    return {
      labId: c.labId,
      labName: c.labName,
      level: risk.level,
      score: risk.score,
      drivers: risk.drivers,
      outstanding: Number(c.outstandingAmount || 0),
      overdueDays: Number(c.overdueDays || 0),
      qualificationLabel: "",
    };
  });

  rows.sort(
    (a, b) =>
      (RISK_LEVEL_RANK[a.level] ?? 9) - (RISK_LEVEL_RANK[b.level] ?? 9) ||
      b.score - a.score
  );

  return rows.slice(0, 12);
}

/**
 * @param {import('./operationsCommandCenterLoader.js').OperationsPayload} payload
 */
export function buildOperationsCommandCenterModel(payload) {
  const riskLabs = buildRiskLabs(payload);
  const attention = buildAttentionQueue(payload);
  return {
    attention,
    attentionBySeverity: groupAttentionBySeverity(attention),
    feed: buildOperationsFeed(payload),
    inventory: buildInventoryRiskPanel(payload),
    agents: buildAgentOperationsPanel(payload),
    financial: buildFinancialPressurePanel(payload),
    health: buildOperationalHealth(payload),
    riskLabs,
    payload,
  };
}

function groupAttentionBySeverity(items) {
  return {
    CRITICAL: items.filter((i) => i.severity === "CRITICAL"),
    ATTENTION: items.filter((i) => i.severity === "ATTENTION"),
    MONITORING: items.filter((i) => i.severity === "MONITORING"),
  };
}