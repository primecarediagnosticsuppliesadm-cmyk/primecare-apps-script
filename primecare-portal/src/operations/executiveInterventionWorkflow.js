import { labIdKey } from "@/utils/labId.js";
import {
  getInterventionRecord,
  isInterventionSnoozed,
  interventionAgeMs,
  timeToResolutionMs,
} from "@/operations/executiveInterventionStateStore.js";
import { buildEntityTimeline } from "@/operations/operationalEventTimeline.js";

const SEVERITY_RANK = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };
const STATE_RANK = {
  REOPENED: 0,
  ESCALATED: 1,
  NEW: 2,
  IN_PROGRESS: 3,
  ASSIGNED: 4,
  WAITING: 5,
  ACKNOWLEDGED: 6,
  RESOLVED: 99,
};

const CLUSTER_LABELS = {
  missing_proof: "Missing visit proofs",
  stale_visit: "Stale lab visits",
  followup_delay: "Follow-ups due",
  overdue_collection: "Overdue collections",
  pending_qualification: "Qualifications pending review",
  credit_hold: "Credit holds",
  critical_stock: "Critical inventory",
  agent_inactivity: "Inactive agents",
  delayed_order: "Delayed orders",
  high_risk: "High-risk accounts",
  other: "Operational issues",
};

function str(v) {
  return String(v ?? "").trim();
}

function parseAgeDays(ageLabel) {
  const m = str(ageLabel).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Infer cluster key for queue compression.
 */
export function inferClusterType(item) {
  const blob = `${item.id} ${item.title} ${item.summary}`.toLowerCase();
  if (blob.includes("proof")) return "missing_proof";
  if (blob.includes("stale") || blob.includes("no visit")) return "stale_visit";
  if (blob.includes("follow-up") || blob.includes("followup")) return "followup_delay";
  if (blob.includes("overdue") || blob.includes("collection due")) return "overdue_collection";
  if (blob.includes("qualification")) return "pending_qualification";
  if (blob.includes("credit hold") || blob.includes("hold")) return "credit_hold";
  if (blob.includes("stock") || blob.includes("inventory")) return "critical_stock";
  if (blob.includes("agent inactivity") || blob.includes("agent-stale")) return "agent_inactivity";
  if (blob.includes("delayed order")) return "delayed_order";
  if (blob.includes("high-risk") || blob.includes("risk")) return "high_risk";
  return "other";
}

function strategicWeight(item, topLabIds) {
  const lid = labIdKey(item.labId);
  if (lid && topLabIds.has(lid)) return 2;
  if (item.source === "revenue") return 2;
  return 0;
}

/**
 * Merge persisted workflow state into operational issue.
 */
export function hydrateInterventionIssue(item, tenantId, records = null) {
  const rec = records?.[item.id] || getInterventionRecord(tenantId, item.id);
  const clusterType = item.clusterType || inferClusterType(item);
  const ageDays = parseAgeDays(item.ageLabel || item.escalationAge);
  const workflowState = rec?.state || "NEW";
  const snoozed = rec ? isInterventionSnoozed(rec) : false;

  return {
    ...item,
    clusterType,
    workflowState,
    snoozed,
    interventionRecord: rec,
    currentOwner: rec?.currentOwner || item.owner || "",
    escalationOwner: rec?.escalationOwner || "",
    pendingActor: rec?.pendingActor || "",
    acknowledgedBy: rec?.acknowledgedBy || "",
    escalatedBy: rec?.escalatedBy || "",
    resolvedBy: rec?.resolvedBy || "",
    interventionAgeMs: rec ? interventionAgeMs(rec) : 0,
    timeToResolutionMs: rec ? timeToResolutionMs(rec) : null,
    ageDays,
    displaySeverity:
      workflowState === "ESCALATED" || workflowState === "REOPENED"
        ? "CRITICAL"
        : item.severity,
  };
}

/**
 * Priority stack: severity → escalated state → age → strategic weight.
 */
export function sortInterventionStack(items, topLabs = []) {
  const topLabIds = new Set(
    (topLabs || []).map((l) => labIdKey(l.labId || l.lab_id)).filter(Boolean)
  );

  return [...items].sort((a, b) => {
    const sev =
      (SEVERITY_RANK[a.displaySeverity || a.severity] ?? 9) -
      (SEVERITY_RANK[b.displaySeverity || b.severity] ?? 9);
    if (sev !== 0) return sev;

    const st =
      (STATE_RANK[a.workflowState] ?? 50) - (STATE_RANK[b.workflowState] ?? 50);
    if (st !== 0) return st;

    const age = (b.ageDays || 0) - (a.ageDays || 0);
    if (age !== 0) return age;

    return strategicWeight(b, topLabIds) - strategicWeight(a, topLabIds);
  });
}

function clusterSeverity(items) {
  if (items.some((i) => (i.displaySeverity || i.severity) === "CRITICAL")) return "CRITICAL";
  if (items.some((i) => (i.displaySeverity || i.severity) === "ATTENTION")) return "ATTENTION";
  return "MONITORING";
}

/**
 * Group issues into clusters (2+ same type) + singles.
 */
export function groupInterventionQueue(items, { minClusterSize = 2 } = {}) {
  const byType = new Map();
  for (const item of items) {
    const key = item.clusterType || inferClusterType(item);
    const list = byType.get(key) || [];
    list.push(item);
    byType.set(key, list);
  }

  const clusters = [];
  const singles = [];

  for (const [clusterType, members] of byType) {
    const sorted = sortInterventionStack(members);
    if (members.length >= minClusterSize) {
      const labs = [...new Set(members.map((m) => m.labName || m.subtitle).filter(Boolean))];
      const agents = [...new Set(members.map((m) => m.currentOwner || m.owner).filter(Boolean))];
      const maxAge = Math.max(...members.map((m) => m.ageDays || 0));
      clusters.push({
        kind: "cluster",
        id: `cluster-${clusterType}`,
        clusterType,
        title: `${CLUSTER_LABELS[clusterType] || clusterType} (${members.length})`,
        count: members.length,
        severity: clusterSeverity(members),
        members: sorted,
        labPreview: labs.slice(0, 4),
        agentPreview: agents.slice(0, 3),
        oldestAgeLabel: maxAge > 0 ? `${maxAge}d` : "Today",
        summary: `${members.length} items · ${labs.length} labs`,
      });
    } else {
      singles.push(...sorted);
    }
  }

  const sortedClusters = clusters.sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
  );
  const sortedSingles = sortInterventionStack(singles);

  return { clusters: sortedClusters, singles: sortedSingles };
}

/**
 * Build intervention timeline for drawer (unified event ledger + legacy fallback).
 */
export function buildInterventionTimeline(issue, payload = {}, options = {}) {
  const tenantId = options.tenantId || payload?.tenantId || "";
  if (tenantId && issue?.id) {
    const unified = buildEntityTimeline({
      tenantId,
      linkedEntityType: "intervention",
      linkedEntityId: issue.id,
      linkedLabId: issue.labId,
      correlationId: issue.labId ? `lab:${labIdKey(issue.labId)}` : `intervention:${issue.id}`,
      payload,
      limit: 24,
    });
    const rec = issue.interventionRecord;
    const legacy = [];
    legacy.push({
      id: "created",
      at: rec?.createdAt || new Date().toISOString(),
      label: "Issue flagged",
      detail: issue.summary || issue.title,
      actor: "System",
      severity: issue.severity,
    });
    for (const h of rec?.history || []) {
      legacy.push({
        id: `h-${h.at}-${h.action}`,
        at: h.at,
        label: h.action.replaceAll("_", " "),
        detail: `${h.fromState} → ${h.toState}${h.note ? ` · ${h.note}` : ""}`,
        actor: h.actor,
        severity: h.toState === "ESCALATED" ? "CRITICAL" : "MONITORING",
      });
    }
    const seen = new Set(unified.map((e) => e.id));
    const merged = [...unified, ...legacy.filter((e) => !seen.has(e.id))];
    merged.sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));
    return merged.slice(0, 24);
  }

  const events = [];
  const rec = issue.interventionRecord;
  events.push({
    id: "created",
    at: rec?.createdAt || new Date().toISOString(),
    label: "Issue flagged",
    detail: issue.summary || issue.title,
    actor: "System",
    severity: issue.severity,
  });
  for (const h of rec?.history || []) {
    events.push({
      id: `h-${h.at}-${h.action}`,
      at: h.at,
      label: h.action.replaceAll("_", " "),
      detail: `${h.fromState} → ${h.toState}${h.note ? ` · ${h.note}` : ""}`,
      actor: h.actor,
      severity: h.toState === "ESCALATED" ? "CRITICAL" : "MONITORING",
    });
  }
  events.sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));
  return events.slice(0, 24);
}

export function filterActiveInterventions(items) {
  return items.filter((i) => {
    if (i.workflowState === "RESOLVED") return false;
    if (i.snoozed) return false;
    return true;
  });
}

export { CLUSTER_LABELS };
