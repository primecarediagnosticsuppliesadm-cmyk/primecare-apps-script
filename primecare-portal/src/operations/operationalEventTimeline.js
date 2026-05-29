import { labIdKey } from "@/utils/labId.js";
import {
  queryOperationalLedger,
  readOperationalLedger,
  compareOperationalEventsDesc,
  normalizeLedgerEventForRead,
  sortOperationalLedgerEvents,
} from "@/operations/operationalEventLedger.js";
import {
  synthesizeEventsFromPayload,
  eventToTimelineRow,
} from "@/operations/operationalEventIngest.js";
import { ledgerDedupeKeys } from "@/operations/operationalEventLedger.js";
import { EVENT_TYPE_LABELS } from "@/operations/operationalEventTypes.js";

const SEVERITY_RANK = { CRITICAL: 0, ATTENTION: 1, MONITORING: 2 };

function str(v) {
  return String(v ?? "").trim();
}

function mergeEvents(ledgerEvents, syntheticEvents, limit) {
  const seen = new Set();
  const merged = [];
  let seq = syntheticEvents.length + ledgerEvents.length;
  for (const e of [...ledgerEvents, ...syntheticEvents]) {
    const key = e.dedupeKey || e.eventId;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalizeLedgerEventForRead(e, seq));
    seq -= 1;
  }
  return sortOperationalLedgerEvents(merged).slice(0, limit);
}

/**
 * Unified entity timeline (intervention, task, lab, agent, evidence).
 */
export function buildEntityTimeline({
  tenantId,
  linkedEntityType,
  linkedEntityId,
  linkedLabId = "",
  linkedAgentId = "",
  correlationId = "",
  payload = {},
  limit = 24,
}) {
  const filters = {};
  if (linkedEntityType && linkedEntityId) {
    filters.linkedEntityType = linkedEntityType;
    filters.linkedEntityId = linkedEntityId;
  }
  if (linkedLabId) filters.linkedLabId = labIdKey(linkedLabId);

  let ledgerRows = tenantId ? queryOperationalLedger(tenantId, filters, limit * 2) : [];

  if (linkedLabId && ledgerRows.length < limit) {
    const byLab = tenantId
      ? queryOperationalLedger(tenantId, { linkedLabId: labIdKey(linkedLabId) }, limit * 2)
      : [];
    const ids = new Set(ledgerRows.map((e) => e.eventId));
    for (const e of byLab) {
      if (!ids.has(e.eventId)) ledgerRows.push(e);
    }
  }

  if (correlationId) {
    const byCorr = tenantId
      ? queryOperationalLedger(tenantId, { correlationId }, limit * 2)
      : [];
    const ids = new Set(ledgerRows.map((e) => e.eventId));
    for (const e of byCorr) {
      if (!ids.has(e.eventId)) ledgerRows.push(e);
    }
  }

  const dedupe = tenantId ? ledgerDedupeKeys(tenantId) : new Set();
  const synthetic = synthesizeEventsFromPayload(payload, dedupe).filter((e) => {
    if (linkedEntityId && e.linkedEntityId === linkedEntityId) return true;
    if (linkedLabId && labIdKey(e.linkedLabId) === labIdKey(linkedLabId)) return true;
    if (correlationId && e.correlationId === correlationId) return true;
    if (linkedAgentId && str(e.linkedAgentId) === str(linkedAgentId)) return true;
    return false;
  });

  const merged = mergeEvents(ledgerRows, synthetic, limit * 2);
  const rows = compressTimelineEvents(merged.map(eventToTimelineRow));
  return rows.slice(0, limit);
}

/**
 * Compress repetitive events (e.g. 8 proof uploads → one summary row).
 */
export function compressTimelineEvents(rows) {
  if (!rows?.length) return [];
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.eventType !== "proof_uploaded") {
      out.push(row);
      i += 1;
      continue;
    }
    let j = i + 1;
    const group = [row];
    while (j < rows.length && rows[j].eventType === "proof_uploaded" && rows[j].actor === row.actor) {
      group.push(rows[j]);
      j += 1;
    }
    if (group.length >= 3) {
      out.push({
        id: `compressed-${row.id}`,
        at: row.at,
        label: `${group.length} proofs uploaded`,
        detail: `By ${row.actor || "Agent"}`,
        actor: row.actor,
        severity: row.severity,
        eventType: "proof_uploaded",
        compressed: true,
        count: group.length,
      });
      i = j;
    } else {
      out.push(...group);
      i = j;
    }
  }
  return out;
}

/**
 * Build correlated chains for audit/replay.
 */
export function buildCorrelatedEventChains(tenantId, payload = {}, limit = 12) {
  const dedupe = tenantId ? ledgerDedupeKeys(tenantId) : new Set();
  const ledger = tenantId ? readOperationalLedger(tenantId).slice(0, 120) : [];
  const synthetic = synthesizeEventsFromPayload(payload, dedupe);
  const all = mergeEvents(ledger, synthetic, 150);

  const byCorrelation = new Map();
  for (const e of all) {
    const cid = str(e.correlationId) || (e.linkedLabId ? `lab:${labIdKey(e.linkedLabId)}` : "");
    if (!cid) continue;
    const list = byCorrelation.get(cid) || [];
    list.push(e);
    byCorrelation.set(cid, list);
  }

  const chains = [];
  for (const [correlationId, events] of byCorrelation) {
    if (events.length < 2) continue;
    events.sort((a, b) => compareOperationalEventsDesc(b, a));
    chains.push({
      correlationId,
      labId: events[0]?.linkedLabId || "",
      events: events.map(eventToTimelineRow),
      summary: events.map((e) => EVENT_TYPE_LABELS[e.eventType] || e.eventType).join(" → "),
    });
  }

  chains.sort((a, b) => b.events.length - a.events.length);
  return chains.slice(0, limit);
}

/**
 * Executive / ops feed rows from ledger + existing feed merge.
 */
export function buildUnifiedOperationsFeedRows({ tenantId, opsFeed = [], payload = {}, limit = 28 }) {
  const dedupe = tenantId ? ledgerDedupeKeys(tenantId) : new Set();
  const ledger = tenantId ? readOperationalLedger(tenantId).slice(0, limit * 2) : [];
  const fromLedger = ledger.map((e) => ({
    id: e.eventId,
    kind: mapEventTypeToFeedKind(e.eventType),
    title: EVENT_TYPE_LABELS[e.eventType] || e.eventType,
    subtitle: e.metadata?.summary || e.metadata?.detail || str(e.linkedEntityId),
    labName: e.metadata?.labName || "",
    labId: e.linkedLabId || "",
    createdAt: e.timestamp,
    severity: mapSeverityToFeed(e.severity),
    agentName: e.actor,
    hasProof: e.eventType === "proof_uploaded",
    eventType: EVENT_TYPE_LABELS[e.eventType] || e.eventType,
    feedSeverity: e.severity,
    source: "ledger",
  }));

  const seen = new Set(fromLedger.map((r) => r.id));
  const contentKeys = new Set(
    fromLedger.map((r) => feedContentKey(r))
  );
  const merged = [...fromLedger];

  for (const row of opsFeed || []) {
    if (!row?.id || seen.has(row.id)) continue;
    const ck = feedContentKey(row);
    if (contentKeys.has(ck)) continue;
    seen.add(row.id);
    contentKeys.add(ck);
    merged.push({ ...row, source: "ops_feed" });
  }

  merged.sort((a, b) => {
    const rowA = { event_timestamp: a.createdAt, inserted_at: a.createdAt, eventId: a.id };
    const rowB = { event_timestamp: b.createdAt, inserted_at: b.createdAt, eventId: b.id };
    return compareOperationalEventsDesc(rowA, rowB);
  });
  return merged.slice(0, limit);
}

function feedContentKey(row) {
  return [
    str(row.labId),
    str(row.kind || row.eventType),
    str(row.createdAt).slice(0, 16),
    str(row.subtitle).slice(0, 48),
  ].join("|");
}

function mapEventTypeToFeedKind(eventType) {
  if (eventType.includes("visit")) return "visit";
  if (eventType.includes("proof")) return "evidence";
  if (eventType.includes("collection") || eventType.includes("payment")) return "payment";
  if (eventType.includes("order")) return "order";
  if (eventType.includes("qualification")) return "qualification";
  if (eventType.includes("inventory") || eventType.includes("reorder")) return "inventory";
  return "ops";
}

function mapSeverityToFeed(severity) {
  const s = str(severity).toUpperCase();
  if (s === "CRITICAL") return "critical";
  if (s === "ATTENTION") return "warning";
  return "info";
}

/**
 * Chronological audit replay window.
 */
export function buildOperationalAuditReplay(tenantId, payload = {}, limit = 40) {
  const dedupe = tenantId ? ledgerDedupeKeys(tenantId) : new Set();
  const ledger = tenantId ? readOperationalLedger(tenantId) : [];
  const synthetic = synthesizeEventsFromPayload(payload, dedupe);
  const merged = mergeEvents(ledger, synthetic, limit * 2);
  return compressTimelineEvents(merged.map(eventToTimelineRow)).slice(0, limit);
}

export function sortTimelineBySeverityThenTime(rows) {
  return [...rows].sort((a, b) => {
    const sev =
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sev !== 0) return sev;
    return Date.parse(b.at || "") - Date.parse(a.at || "");
  });
}
