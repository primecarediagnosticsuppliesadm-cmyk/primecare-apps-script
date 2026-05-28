import { labIdKey } from "@/utils/labId.js";
import {
  buildOperationsCommandCenterModel,
  buildExecutiveDailySnapshot,
  buildOperationalHealthTiles,
  buildRiskLabs,
  buildAgentOperationsPanel,
} from "@/operations/operationsCommandCenterModel.js";
import { loadInterventionRecords } from "@/operations/executiveInterventionStateStore.js";
import {
  hydrateInterventionIssue,
  sortInterventionStack,
  groupInterventionQueue,
  filterActiveInterventions,
  inferClusterType,
} from "@/operations/executiveInterventionWorkflow.js";

const SEVERITY_ORDER = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };

function str(v) {
  return String(v ?? "").trim();
}

function mapAttentionToPriority(item) {
  const action = item.action || "lab";
  let cta = "open_lab";
  if (action === "collections") cta = "open_collection";
  else if (action === "visits") cta = "assign_followup";
  else if (action === "qualification") cta = "open_qualification";
  else if (action === "orders") cta = "open_orders";
  else if (action === "inventory") cta = "open_inventory";

  const mapped = {
    id: item.id,
    severity: item.severity,
    title: item.title,
    summary: item.explanation || item.recommendedAction,
    subtitle: item.subtitle || item.labName,
    owner: item.owner || "",
    ageLabel: item.ageLabel || "",
    recommendedAction: item.recommendedAction || item.explanation,
    labId: item.labId || "",
    labName: item.labName || "",
    orderId: item.orderId || "",
    createdAt: item.ageLabel,
    cta,
    actionLabel: item.actionLabel || "Review",
    source: "attention",
  };
  mapped.clusterType = inferClusterType(mapped);
  return mapped;
}

/**
 * Deterministic executive priorities (no AI).
 */
export function buildExecutivePriorities(payload, opsModel) {
  const items = (opsModel.attention || []).map(mapAttentionToPriority);

  const agents = opsModel.agents || {};
  for (const agent of agents.staleAgents || []) {
    const row = {
      id: `agent-stale-${agent.name}`,
      severity: "ATTENTION",
      title: "Agent inactivity",
      summary: `No recent field visits · last activity ${agent.lastVisitDate || "unknown"}`,
      subtitle: agent.name,
      owner: agent.name,
      ageLabel: "7d+",
      recommendedAction: "Review territory and assign follow-ups",
      labId: "",
      labName: "",
      cta: "open_agent",
      actionLabel: "Open Agent",
      source: "agents",
    };
    row.clusterType = inferClusterType(row);
    items.push(row);
  }

  const topLabs = payload.dashboard?.executive?.topLabsByRevenue || [];
  const visitsByLab = new Map();
  for (const v of payload.visits || []) {
    const lid = labIdKey(v.labId);
    if (!lid) continue;
    const list = visitsByLab.get(lid) || [];
    list.push(v);
    visitsByLab.set(lid, list);
  }

  for (const lab of topLabs.slice(0, 5)) {
    const lid = labIdKey(lab.labId || lab.lab_id);
    const labVisits = visitsByLab.get(lid) || [];
    const last = labVisits.sort(
      (a, b) => Date.parse(b.visitDate || b.date || "") - Date.parse(a.visitDate || a.date || "")
    )[0];
    const lastDate = last?.visitDate || last?.date;
    const age = lastDate
      ? Math.floor((Date.now() - Date.parse(String(lastDate).slice(0, 10))) / 86400000)
      : null;
    if (age == null || age >= 10) {
      const row = {
        id: `priority-lab-${lid || lab.labName}`,
        severity: age != null && age >= 14 ? "CRITICAL" : "ATTENTION",
        title: "High-value lab needs visit",
        summary:
          age == null
            ? "Revenue account with no visit on record"
            : `No visit in ${age} days · protect revenue relationship`,
        subtitle: lab.labName || lid,
        owner: last?.agent || last?.agentName || "",
        ageLabel: age != null ? `${age}d` : "No visit",
        recommendedAction: "Schedule executive-backed field visit",
        labId: lid,
        labName: lab.labName,
        cta: "open_lab",
        actionLabel: "Open Lab",
        source: "revenue",
      };
      row.clusterType = inferClusterType(row);
      items.push(row);
    }
  }

  const seen = new Set();
  const deduped = items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  deduped.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  return deduped.slice(0, 18);
}

const FOUNDER_ESCALATION_TITLES = [
  "credit hold",
  "overdue collection",
  "high-risk",
  "stale lab",
  "qualification",
  "missing visit proof",
  "missing",
  "collection proof",
  "delayed order",
  "critical stock",
];

/**
 * Issues requiring founder/executive escalation only.
 */
export function buildFounderAttentionQueue(opsModel) {
  const items = (opsModel.attention || []).filter((item) => {
    if (item.severity === "CRITICAL") return true;
    const blob = `${item.title} ${item.explanation}`.toLowerCase();
    return FOUNDER_ESCALATION_TITLES.some((k) => blob.includes(k));
  });

  return items.map((item) => {
    const base = mapAttentionToPriority(item);
    return {
      ...base,
      escalationAge: item.ageLabel || "Today",
      lastAction: item.explanation || "Operational flag raised",
      nextExpectedAction: item.recommendedAction || item.actionLabel,
      cta: base.cta === "open_lab" ? "view_timeline" : base.cta,
    };
  }).slice(0, 14);
}

const EVENT_TYPE_LABELS = {
  order: "Order",
  payment: "Collection",
  visit: "Visit",
  evidence: "Evidence",
  inventory: "Inventory",
  qualification: "Qualification",
  ops: "Operations",
};

function mapFeedKindToEventType(row) {
  const t = str(row.title).toLowerCase();
  if (t.includes("proof") || t.includes("receipt")) return "Proof uploaded";
  if (t.includes("visit")) return "Visit logged";
  if (t.includes("payment") || t.includes("collection")) return "Collection received";
  if (t.includes("order")) return row.title.includes("fulfill") ? "Order fulfilled" : "Order placed";
  if (t.includes("qualification")) return "Qualification updated";
  if (t.includes("stock") || row.kind === "inventory") return "Stock risk";
  if (t.includes("follow")) return "Follow-up created";
  if (t.includes("overdue")) return "Overdue flagged";
  return EVENT_TYPE_LABELS[row.kind] || "Operations";
}

/**
 * Telemetry feed with dedupe and agent enrichment.
 */
export function buildExecutiveOperationsFeed(payload, opsFeed, limit = 28) {
  const agentByLab = new Map();
  const agentByVisit = new Map();
  for (const v of payload.visits || []) {
    const agent = str(v.agent || v.agentName);
    const lid = labIdKey(v.labId);
    if (lid && agent) agentByLab.set(lid, agent);
    const vid = str(v.visitId || v.id);
    if (vid && agent) agentByVisit.set(vid, agent);
  }

  const seen = new Set();
  const rows = [];

  for (const row of opsFeed || []) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);

    const severity =
      row.severity === "warning" || row.severity === "critical"
        ? "ATTENTION"
        : row.severity === "high"
          ? "CRITICAL"
          : "MONITORING";

    rows.push({
      ...row,
      eventType: mapFeedKindToEventType(row),
      agentName:
        str(row.agentName) ||
        agentByLab.get(labIdKey(row.labId)) ||
        "",
      hasProof:
        row.kind === "evidence" ||
        str(row.title).toLowerCase().includes("proof"),
      feedSeverity: severity,
    });
  }

  rows.sort((a, b) => {
    const tb = Date.parse(b.createdAt || "") || 0;
    const ta = Date.parse(a.createdAt || "") || 0;
    return tb - ta;
  });

  return rows.slice(0, limit);
}

function trendFromStatus(status) {
  if (status === "healthy") return "stable";
  if (status === "watch") return "watch";
  return "declining";
}

/**
 * Executive health strip (+ qualification pipeline).
 */
export function buildExecutiveHealthStrip(payload, opsModel) {
  const base = buildOperationalHealthTiles(payload, opsModel.health);
  const pendingQual = (payload.qualifications || []).filter((q) => {
    const r = str(q.founderReviewStatus || q.founder_review_status).toLowerCase();
    return r === "pending" || r === "needs_info";
  }).length;

  const qualStatus =
    pendingQual >= 5 ? "risk" : pendingQual > 0 ? "watch" : "healthy";
  const qualLabel =
    qualStatus === "healthy" ? "Stable" : qualStatus === "watch" ? "Watch" : "Needs attention";

  const qualificationTile = {
    key: "qualification",
    title: "Qualification pipeline",
    status: qualStatus,
    label: qualLabel,
    trend: trendFromStatus(qualStatus),
    detail:
      pendingQual > 0
        ? `${pendingQual} awaiting founder review`
        : "Pipeline current",
    action: "qualificationReview",
  };

  return base.map((t) => ({
    ...t,
    trend: trendFromStatus(t.status),
  })).concat(qualificationTile);
}

function worseSeverity(a, b) {
  const rank = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };
  return (rank[a] ?? 9) <= (rank[b] ?? 9) ? a : b;
}

/**
 * Merge priorities + founder queue, hydrate workflow state, compress clusters.
 */
export function buildInterventionQueues(priorities, founderQueue, tenantId, payload) {
  const map = new Map();
  for (const item of [...(founderQueue || []), ...(priorities || [])]) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, { ...item, founderEscalation: founderQueue?.some((f) => f.id === item.id) });
    } else {
      map.set(item.id, {
        ...existing,
        ...item,
        severity: worseSeverity(existing.severity, item.severity),
        founderEscalation: existing.founderEscalation || founderQueue?.some((f) => f.id === item.id),
      });
    }
  }

  const records = loadInterventionRecords(tenantId);
  const topLabs = payload?.dashboard?.executive?.topLabsByRevenue || [];
  const hydrated = [...map.values()].map((item) =>
    hydrateInterventionIssue(
      { ...item, clusterType: item.clusterType || inferClusterType(item) },
      tenantId,
      records
    )
  );

  const active = filterActiveInterventions(hydrated);
  const sorted = sortInterventionStack(active, topLabs);
  const { clusters, singles } = groupInterventionQueue(sorted);

  const founderActive = founderQueue
    .map((f) => hydrated.find((h) => h.id === f.id) || hydrateInterventionIssue(f, tenantId, records))
    .filter((i) => i.workflowState !== "RESOLVED" && !i.snoozed);

  return {
    clusters,
    singles,
    allIssues: hydrated,
    founderActive: sortInterventionStack(founderActive, topLabs),
    resolvedCount: hydrated.filter((i) => i.workflowState === "RESOLVED").length,
    snoozedCount: hydrated.filter((i) => i.snoozed).length,
  };
}

/**
 * Full executive intervention model (reuses operations center core).
 */
export function buildExecutiveInterventionModel(payload, options = {}) {
  const tenantId = options.tenantId || payload?.tenantId || "";
  const ops = buildOperationsCommandCenterModel(payload);
  const priorities = buildExecutivePriorities(payload, ops);
  const founderQueue = buildFounderAttentionQueue(ops);
  const feed = buildExecutiveOperationsFeed(payload, ops.feed);
  const healthStrip = buildExecutiveHealthStrip(payload, ops);
  const snapshot = buildExecutiveDailySnapshot(payload);
  const riskLabs = buildRiskLabs(payload);
  const agents = buildAgentOperationsPanel(payload);
  const interventionQueues = buildInterventionQueues(
    priorities,
    founderQueue,
    tenantId,
    payload
  );

  return {
    ...ops,
    snapshot,
    priorities,
    founderQueue,
    feed,
    healthStrip,
    riskLabs,
    agents,
    payload,
    interventionQueues,
  };
}
