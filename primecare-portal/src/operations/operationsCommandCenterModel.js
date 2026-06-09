import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { productsNearStockoutFromInventoryStats } from "@/metrics/computeInventoryMetrics.js";
import { filterVisitProofEvidence } from "@/utils/operationalEvidenceUi.js";
import { labIdKey } from "@/utils/labId.js";
import {
  getPipelineStageLabel,
  isQualificationPipelinePending,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

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
    recommendedAction: item.recommendedAction || item.explanation,
    ageLabel: item.ageLabel || "Today",
    labId: item.labId || "",
    labName: item.labName || "",
    owner: item.owner || item.agent || "",
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

  const evidence = payload.evidence || [];
  const visitsByLab = new Map();
  for (const v of payload.visits || []) {
    const lid = labIdKey(v.labId || v.lab_id);
    if (!lid) continue;
    const list = visitsByLab.get(lid) || [];
    list.push(v);
    visitsByLab.set(lid, list);
  }

  for (const c of payload.collections || []) {
    const hold = str(c.creditHold || c.credit_hold).toUpperCase();
    if (hold === "HOLD") {
      items.push(
        makeAttentionItem({
          id: `hold-${c.labId}`,
          severity: "CRITICAL",
          title: "Credit hold",
          subtitle: c.labName || c.labId,
          explanation: "Account blocked for new orders until collections clear",
          recommendedAction: "Review outstanding and release or escalate",
          labId: c.labId,
          labName: c.labName,
          owner: c.agent || c.assignedAgent,
          action: "collections",
          actionLabel: "Review Account",
        })
      );
    }

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
          owner: c.agent || c.assignedAgent,
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
          recommendedAction: "Log visit or record collection follow-up",
          labId: c.labId,
          labName: c.labName,
          owner: c.agent || c.assignedAgent,
          action: "visits",
          actionLabel: "Assign Follow-up",
        })
      );
    }
  }

  let staleLabCount = 0;
  for (const c of payload.collections || []) {
    if (staleLabCount >= 8) break;
    const lid = labIdKey(c.labId);
    const labVisits = (visitsByLab.get(lid) || []).sort((a, b) => {
      const tb = Date.parse(b.visitDate || b.date || "") || 0;
      const ta = Date.parse(a.visitDate || a.date || "") || 0;
      return tb - ta;
    });
    const lastVisit = labVisits[0];
    const visitAge = lastVisit ? daysSince(lastVisit.visitDate || lastVisit.date) : null;
    const strategic =
      Number(c.outstandingAmount || 0) > 0 || labVisits.length > 0;
    if (!strategic) continue;
    if (visitAge == null || visitAge >= 14) {
      staleLabCount += 1;
      items.push(
        makeAttentionItem({
          id: `stale-lab-${c.labId}`,
          severity: visitAge != null && visitAge >= 21 ? "CRITICAL" : "ATTENTION",
          title: "Stale lab",
          subtitle: c.labName || c.labId,
          explanation:
            visitAge == null
              ? "No field visit on record"
              : `No visit in ${visitAge} days`,
          recommendedAction: "Schedule agent visit this week",
          ageLabel: visitAge != null ? `${visitAge}d` : "No visit",
          labId: c.labId,
          labName: c.labName,
          owner: c.agent || c.assignedAgent,
          action: "visits",
          actionLabel: "Plan Visit",
        })
      );
    }
  }

  for (const q of payload.qualifications || []) {
    if (!isQualificationPipelinePending(q)) continue;
    const stage = normalizeQualificationPipelineStage(q.pipelineStage || q.pipeline_stage);
    const stageLabel = getPipelineStageLabel(stage);
    items.push(
      makeAttentionItem({
        id: `qual-${q.labId}`,
        severity: stage === "new" || stage === "contacted" ? "MONITORING" : "ATTENTION",
        title: "Qualification pipeline pending",
        subtitle: q.labName || q.labId,
        explanation: `Pipeline not qualified · ${stageLabel}`,
        recommendedAction: "Distributor OS → Labs → Qualification",
        labId: q.labId,
        labName: q.labName,
        action: "qualification",
        actionLabel: "Open Qualification",
      })
    );
  }

  const recentVisits = (payload.visits || [])
    .filter((v) => {
      const age = daysSince(v.visitDate || v.date);
      return age != null && age <= 7;
    })
    .slice(0, 20);

  for (const v of recentVisits) {
    const vid = str(v.visitId || v.id);
    if (!vid) continue;
    const proofs = filterVisitProofEvidence(evidence, vid);
    if (!proofs.length) {
      items.push(
        makeAttentionItem({
          id: `no-proof-${vid}`,
          severity: "MONITORING",
          title: "Missing visit proof",
          subtitle: v.labName || v.labId,
          explanation: `Visit ${v.visitType || "logged"} without photo evidence`,
          recommendedAction: "Ask agent to upload visit proof",
          labId: v.labId,
          labName: v.labName,
          owner: v.agent || v.agentName,
          action: "visits",
          actionLabel: "Open Visits",
        })
      );
    }
  }

  let localEvidenceAlerts = 0;
  for (const ev of evidence) {
    if (ev.storageBackend !== "local_embedded") continue;
    if (localEvidenceAlerts >= 4) break;
    localEvidenceAlerts += 1;
    items.push(
      makeAttentionItem({
        id: `ev-fail-${ev.evidenceId}`,
        severity: "ATTENTION",
        title: "Evidence upload pending sync",
        subtitle: ev.labId || "Operational evidence",
        explanation: `${ev.fileName || "File"} stored locally — durable upload may have failed`,
        recommendedAction: "Retry upload or verify storage bucket",
        labId: ev.labId,
        action: "visits",
        actionLabel: "View Evidence",
      })
    );
  }

  const seen = new Set();
  const deduped = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  deduped.sort(
    (a, b) =>
      (ATTENTION_SEVERITY_ORDER[a.severity] ?? 9) - (ATTENTION_SEVERITY_ORDER[b.severity] ?? 9)
  );

  return deduped.slice(0, 28);
}

const FEED_KIND_LABELS = {
  order: "Order",
  payment: "Payment",
  visit: "Visit",
  evidence: "Evidence",
  inventory: "Inventory",
  qualification: "Qualification",
  ops: "Operations",
};

function feedRow(partial) {
  return {
    kind: "ops",
    severity: "info",
    ...partial,
    telemetryLabel: FEED_KIND_LABELS[partial.kind] || "Operations",
  };
}

/**
 * @param {import('./operationsCommandCenterLoader.js').OperationsPayload} payload
 */
export function buildOperationsFeed(payload, limit = 36) {
  const feed = [];

  for (const row of payload.notifications || []) {
    const type = String(row.event_type || "").toLowerCase();
    const payloadJson =
      row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
    let kind = "ops";
    let title = type.replaceAll("_", " ") || "Operational update";
    if (type.includes("order")) {
      kind = "order";
      title = type.includes("fulfill") ? "Order fulfilled" : "Order placed";
    } else if (type.includes("payment") || type.includes("collection")) {
      kind = "payment";
      title = type.includes("payment") ? "Payment received" : "Collection event";
    } else if (type.includes("qualification")) {
      kind = "qualification";
      title = "Qualification updated";
    } else if (type.includes("stock") || type.includes("inventory")) {
      kind = "inventory";
      title = "Inventory movement";
    }
    feed.push(
      feedRow({
        id: row.event_id || `evt-${row.created_at}`,
        kind,
        title,
        subtitle: String(payloadJson.message || row.source_module || "").slice(0, 120),
        labName: payloadJson.labName || payloadJson.lab_name || "",
        labId: payloadJson.labId || payloadJson.lab_id || "",
        createdAt: row.created_at,
        severity: String(row.severity || "info").toLowerCase(),
      })
    );
  }

  for (const o of (payload.orders || []).slice(0, 10)) {
    const status = normalizeOrderStatus(o.orderStatus);
    feed.push(
      feedRow({
        id: `order-${o.orderId}`,
        kind: "order",
        title: status.toLowerCase().includes("fulfill") ? "Order fulfilled" : "Order placed",
        subtitle: `${formatCurrency(o.orderTotal)} · ${status}`,
        labName: o.labName,
        labId: o.labId,
        createdAt: o.orderDate || o.createdAt,
        severity: isOrderDelayed(o) ? "warning" : "info",
      })
    );
  }

  for (const v of (payload.visits || []).slice(0, 14)) {
    feed.push(
      feedRow({
        id: `visit-${v.id || v.visitId}-${v.visitDate}`,
        kind: "visit",
        title: "Visit logged",
        subtitle: `${v.visitType || "Field visit"} · ${v.agentName || v.agent || "Agent"}`,
        labName: v.labName,
        labId: v.labId,
        createdAt: v.visitDate || v.date,
        severity: "info",
      })
    );
  }

  for (const ev of (payload.evidence || []).slice(0, 14)) {
    const kind = str(ev.kind);
    feed.push(
      feedRow({
        id: `evidence-${ev.evidenceId}`,
        kind: "evidence",
        title:
          kind === "visit_photo"
            ? "Proof uploaded"
            : kind === "collection_receipt"
              ? "Payment receipt uploaded"
              : "Collection proof uploaded",
        subtitle: ev.fileName || ev.remarks || ev.labId,
        labName: "",
        labId: ev.labId,
        createdAt: ev.uploadedAt,
        severity: ev.storageBackend === "local_embedded" ? "warning" : "info",
      })
    );
  }

  for (const q of (payload.qualifications || []).slice(0, 8)) {
    feed.push(
      feedRow({
        id: `qual-feed-${q.labId}-${q.updatedAt}`,
        kind: "qualification",
        title: "Qualification updated",
        subtitle: `${q.qualificationBand || "Band pending"} · ${getPipelineStageLabel(q.pipelineStage || q.pipeline_stage)}`,
        labName: q.labName,
        labId: q.labId,
        createdAt: q.updatedAt || q.createdAt,
        severity: "info",
      })
    );
  }

  for (const po of (payload.purchaseOrders || []).slice(0, 6)) {
    const status = str(po.status || po.poStatus);
    if (!status.toLowerCase().includes("received") && !status.toLowerCase().includes("closed")) {
      continue;
    }
    feed.push(
      feedRow({
        id: `po-recv-${po.poId || po.id}`,
        kind: "inventory",
        title: "Stock received",
        subtitle: po.supplierName || status || "Procurement",
        labName: "",
        labId: "",
        createdAt: po.updatedAt || po.createdAt,
        severity: "info",
      })
    );
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
  const visitsTodayList = (payload.visits || []).filter(
    (v) => String(v.visitDate || v.date || "").slice(0, 10) === todayYmd
  );
  const visitsToday = visitsTodayList.length;

  const collSummary = summarizeCollectionsList(payload.collections || []);
  const todayCollectionsAmount = Number(summary.todayCollections ?? 0);
  const followUpsDue = (payload.collections || []).filter((c) => {
    const d = parseYmd(c.nextFollowUp);
    return d && d.getTime() <= new Date(todayYmd).getTime();
  }).length;

  const evidence = payload.evidence || [];
  const proofsToday = evidence.filter((e) => {
    const d = str(e.uploadedAt).slice(0, 10);
    return d === todayYmd;
  }).length;

  const labsTouched = new Set(
    visitsTodayList.map((v) => labIdKey(v.labId)).filter(Boolean)
  ).size;

  const agents = new Map();
  for (const v of payload.visits || []) {
    const name = str(v.agent || v.agentName) || "Unknown";
    const row = agents.get(name) || {
      name,
      visits: 0,
      sold: 0,
      lastVisitDate: "",
    };
    row.visits += 1;
    row.sold += Number(v.soldValue || 0);
    const vd = str(v.visitDate || v.date).slice(0, 10);
    if (vd > row.lastVisitDate) row.lastVisitDate = vd;
    agents.set(name, row);
  }

  const agentRows = [...agents.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8);

  const staleAgents = agentRows.filter((a) => {
    const last = parseYmd(a.lastVisitDate);
    if (!last) return true;
    const age = daysSince(a.lastVisitDate);
    return age != null && age >= 7;
  });

  const activeAgentsToday = new Set(
    visitsTodayList.map((v) => str(v.agent || v.agentName)).filter(Boolean)
  ).size;

  return {
    visitsToday: visitsToday || Number(summary.recentVisits ?? 0),
    collectionsToday: formatCurrency(todayCollectionsAmount),
    collectionsTodayRaw: todayCollectionsAmount,
    proofsUploaded: proofsToday,
    labsTouched,
    activeAgentsToday,
    followUpsPending: followUpsDue,
    missedFollowUps: followUpsDue,
    overdueCollections: collSummary.overdueCount,
    staleAgents: staleAgents.slice(0, 6),
    staleAgentCount: staleAgents.length,
    agentRows,
    healthLabel:
      followUpsDue > 5
        ? "Follow-ups backing up"
        : visitsToday > 0
          ? "Active field day"
          : "Low field activity",
  };
}

/**
 * Compact executive KPI strip (deterministic, no forecasting).
 */
export function buildExecutiveDailySnapshot(payload) {
  const executive = payload.dashboard?.executive || {};
  const summary = payload.dashboard?.summary || {};
  const collSummary = summarizeCollectionsList(payload.collections || []);
  const todayYmd = localDateYmd();

  const visitsToday = (payload.visits || []).filter(
    (v) => str(v.visitDate || v.date).slice(0, 10) === todayYmd
  );
  const activeAgentsToday = new Set(
    visitsToday.map((v) => str(v.agent || v.agentName)).filter(Boolean)
  ).size;

  const highRiskLabs = (payload.collections || []).filter((c) => {
    const hold = str(c.creditHold || c.credit_hold).toUpperCase() === "HOLD";
    const risk = str(c.riskStatus).toLowerCase() === "high";
    return hold || risk || Number(c.overdueDays) >= 14;
  }).length;

  const pendingOrders = (payload.orders || []).filter((o) => {
    const s = normalizeOrderStatus(o.orderStatus).toLowerCase();
    return s !== "fulfilled" && s !== "cancelled" && s !== "delivered";
  }).length;

  const invPanel = buildInventoryRiskPanel(payload);
  const lowStockSkus =
    invPanel.critical.length ||
    Number(executive.productsNearStockout ?? summary.stockStats?.nearStockout ?? 0);

  const hasCollections = (payload.collections || []).length > 0;
  const hasVisits = (payload.visits || []).length > 0;
  const revenueRaw = Number(executive.todaysRevenue ?? 0);

  return {
    revenueToday: formatCurrency(revenueRaw),
    revenueTodayRaw: revenueRaw,
    hasRevenueActivity: revenueRaw > 0 || visitsToday.length > 0 || (payload.orders || []).length > 0,
    hasCollections,
    collectionsPending: collSummary.overdueCount ?? 0,
    collectionsPendingLabel: hasCollections
      ? `${collSummary.overdueCount ?? 0} overdue`
      : "No AR data",
    collectionsExposure: formatCurrency(collSummary.totalOutstanding ?? 0),
    highRiskLabs,
    activeAgentsToday,
    ordersPendingFulfillment: pendingOrders,
    lowStockSkus,
    visitsToday: visitsToday.length,
    hasVisits,
  };
}

/**
 * Simple operational health tiles (status, not charts).
 */
export function buildOperationalHealthTiles(payload, health) {
  const collSummary = summarizeCollectionsList(payload.collections || []);
  const agents = buildAgentOperationsPanel(payload);
  const evidence = payload.evidence || [];
  const recentVisits = (payload.visits || []).slice(0, 20);
  const visitsWithProof = recentVisits.filter((v) => {
    const vid = str(v.visitId || v.id);
    return vid && filterVisitProofEvidence(evidence, vid).length > 0;
  });
  const compliancePct =
    recentVisits.length > 0
      ? Math.round((visitsWithProof.length / recentVisits.length) * 100)
      : null;
  const localOnly = evidence.filter((e) => e.storageBackend === "local_embedded").length;

  const orders = payload.orders || [];
  const openOrders = orders.filter((o) => {
    const s = normalizeOrderStatus(o.orderStatus).toLowerCase();
    return s !== "fulfilled" && s !== "cancelled";
  });
  const delayed = openOrders.filter(isOrderDelayed);

  function statusFromScore(score, invert = false) {
    const s = invert ? 100 - score : score;
    if (s >= 75) return { status: "healthy", label: "Healthy" };
    if (s >= 50) return { status: "watch", label: "Watch" };
    return { status: "risk", label: "At risk" };
  }

  return [
    {
      key: "collections",
      title: "Collections",
      ...statusFromScore(health.contributors.collectionsHealth),
      detail: `${collSummary.overdueCount ?? 0} overdue · ${formatCurrency(collSummary.totalOutstanding ?? 0)} out`,
      action: "collections",
    },
    {
      key: "inventory",
      title: "Inventory",
      ...statusFromScore(health.contributors.inventoryHealth),
      detail: `${buildInventoryRiskPanel(payload).critical.length} critical SKUs`,
      action: "inventory",
    },
    {
      key: "field",
      title: "Field activity",
      ...statusFromScore(Math.min(100, agents.visitsToday * 12)),
      detail: `${agents.visitsToday} visits · ${agents.activeAgentsToday} agents active`,
      action: "visits",
    },
    {
      key: "evidence",
      title: "Evidence compliance",
      ...(compliancePct != null
        ? statusFromScore(compliancePct)
        : { status: "watch", label: "No visits" }),
      detail:
        compliancePct == null
          ? "No recent visits to measure proof compliance"
          : localOnly > 0
            ? `${compliancePct}% visits with proof · ${localOnly} local-only upload`
            : `${compliancePct}% recent visits with proof`,
      action: "visits",
    },
    {
      key: "fulfillment",
      title: "Order fulfillment",
      ...statusFromScore(health.contributors.fulfillmentHealth),
      detail:
        delayed.length > 0
          ? `${delayed.length} delayed of ${openOrders.length} open`
          : `${openOrders.length} open orders`,
      action: "orders",
    },
  ];
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
export function buildInventoryEconomicsRiskCards(payload) {
  const economics = payload.inventoryEconomics;
  if (!economics) return [];
  const cards = [];
  if (num(economics.deadInventoryValue) > 0) {
    cards.push({
      id: "dead-inventory",
      title: "Dead inventory detected",
      detail: `${economics.deadInventoryValueLabel} with no movement in 120+ days`,
      severity: "High",
    });
  }
  if (num(economics.lowStockExposure) > 0) {
    cards.push({
      id: "low-stock-exposure",
      title: "Low stock exposure",
      detail: `${economics.lowStockExposure} SKU(s) below reorder point`,
      severity: "Medium",
    });
  }
  if (
    num(economics.reorderExposure) > 0 &&
    num(economics.totalInventoryValue) > 0 &&
    num(economics.reorderExposure) / num(economics.totalInventoryValue) >= 0.25
  ) {
    cards.push({
      id: "reorder-exposure",
      title: "Reorder exposure above threshold",
      detail: `${economics.reorderExposureLabel} estimated to restore low-stock SKUs`,
      severity: "High",
    });
  }
  return cards;
}

export function buildOperationsCommandCenterModel(payload) {
  const riskLabs = buildRiskLabs(payload);
  const attention = buildAttentionQueue(payload);
  const health = buildOperationalHealth(payload);
  return {
    snapshot: buildExecutiveDailySnapshot(payload),
    attention,
    attentionBySeverity: groupAttentionBySeverity(attention),
    feed: buildOperationsFeed(payload),
    inventory: buildInventoryRiskPanel(payload),
    inventoryEconomics: payload.inventoryEconomics || null,
    inventoryEconomicsRisks: buildInventoryEconomicsRiskCards(payload),
    agents: buildAgentOperationsPanel(payload),
    financial: buildFinancialPressurePanel(payload),
    health,
    healthTiles: buildOperationalHealthTiles(payload, health),
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