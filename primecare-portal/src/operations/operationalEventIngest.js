import { labIdKey } from "@/utils/labId.js";
import { EVENT_TYPE_LABELS } from "@/operations/operationalEventTypes.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Synthesize ledger-shaped events from ops payload (read-only, for backfill/timeline merge).
 */
export function synthesizeEventsFromPayload(payload = {}, existingDedupe = new Set()) {
  const events = [];
  const tenantId = str(payload.tenantId);

  function push(partial) {
    const dedupeKey = str(partial.dedupeKey);
    if (dedupeKey && existingDedupe.has(dedupeKey)) return;
    const event_timestamp = str(partial.timestamp) || new Date().toISOString();
    const sequence = Number(partial.sequence) || Date.parse(event_timestamp) || Date.now();
    events.push({
      eventId: partial.eventId || `syn-${dedupeKey || sequence}`,
      tenantId,
      eventType: partial.eventType,
      severity: partial.severity || "MONITORING",
      actor: partial.actor || "System",
      actorRole: partial.actorRole || "",
      linkedEntityType: partial.linkedEntityType || "",
      linkedEntityId: partial.linkedEntityId || "",
      linkedLabId: partial.linkedLabId || "",
      linkedAgentId: partial.linkedAgentId || "",
      event_timestamp,
      inserted_at: str(partial.inserted_at) || event_timestamp,
      sequence,
      timestamp: event_timestamp,
      metadata: partial.metadata || {},
      correlationId: partial.correlationId || "",
      dedupeKey,
      source: "synthetic",
    });
  }

  for (const v of (payload.visits || []).slice(0, 40)) {
    const visitId = str(v.visitId || v.id);
    push({
      eventType: "visit_logged",
      severity: "MONITORING",
      actor: v.agent || v.agentName || "Agent",
      actorRole: "agent",
      linkedEntityType: "visit",
      linkedEntityId: visitId,
      linkedLabId: labIdKey(v.labId),
      linkedAgentId: str(v.agent || v.agentName),
      timestamp: v.visitDate || v.date || v.createdAt,
      metadata: { visitType: v.visitType, labName: v.labName },
      dedupeKey: visitId ? `visit_logged:${visitId}` : "",
      correlationId: visitId ? `visit:${visitId}` : "",
    });
  }

  for (const ev of (payload.evidence || []).slice(0, 40)) {
    const eid = str(ev.evidenceId);
    push({
      eventType: "proof_uploaded",
      severity: "MONITORING",
      actor: ev.uploadedBy || "Agent",
      actorRole: ev.uploadedByRole || "agent",
      linkedEntityType: "evidence",
      linkedEntityId: eid,
      linkedLabId: labIdKey(ev.labId),
      timestamp: ev.uploadedAt,
      metadata: { fileName: ev.fileName, kind: ev.kind, visitId: ev.visitId },
      dedupeKey: eid ? `proof_uploaded:${eid}` : "",
      correlationId: ev.visitId ? `visit:${ev.visitId}` : "",
    });
  }

  for (const c of (payload.collections || []).slice(0, 30)) {
    const lid = labIdKey(c.labId || c.lab_id);
    push({
      eventType: "collection_recorded",
      severity: Number(c.overdueDays || 0) >= 14 ? "CRITICAL" : Number(c.overdueDays || 0) > 0 ? "ATTENTION" : "MONITORING",
      actor: c.agent || c.assignedAgent || "Collections",
      linkedEntityType: "collection",
      linkedEntityId: str(c.collectionId || c.id || lid),
      linkedLabId: lid,
      timestamp: c.updatedAt || c.collectionDate,
      metadata: { outstanding: c.outstandingAmount, labName: c.labName },
      dedupeKey: lid ? `collection_recorded:${lid}:${str(c.updatedAt).slice(0, 10)}` : "",
    });
  }

  for (const o of (payload.orders || []).slice(0, 20)) {
    const oid = str(o.orderId);
    const fulfilled = str(o.orderStatus).toLowerCase().includes("fulfill");
    push({
      eventType: fulfilled ? "order_fulfilled" : "order_created",
      severity: "MONITORING",
      linkedEntityType: "order",
      linkedEntityId: oid,
      linkedLabId: labIdKey(o.labId),
      timestamp: o.orderDate || o.createdAt,
      metadata: { total: o.orderTotal, status: o.orderStatus, labName: o.labName },
      dedupeKey: oid ? `${fulfilled ? "order_fulfilled" : "order_created"}:${oid}` : "",
    });
  }

  for (const row of (payload.notifications || []).slice(0, 24)) {
    const type = str(row.event_type).toLowerCase();
    let eventType = "payment_received";
    if (type.includes("visit")) eventType = "visit_logged";
    else if (type.includes("order") && type.includes("fulfill")) eventType = "order_fulfilled";
    else if (type.includes("order")) eventType = "order_created";
    else if (type.includes("qualification")) eventType = "qualification_updated";
    else if (type.includes("stock") || type.includes("inventory")) eventType = "inventory_adjusted";
    push({
      eventType,
      severity: str(row.severity) === "critical" ? "CRITICAL" : str(row.severity) === "high" ? "ATTENTION" : "MONITORING",
      linkedEntityType: "notification",
      linkedEntityId: str(row.event_id),
      linkedLabId: labIdKey(row.payload_json?.labId || row.payload_json?.lab_id),
      timestamp: row.created_at,
      metadata: row.payload_json || {},
      dedupeKey: row.event_id ? `notification:${row.event_id}` : "",
    });
  }

  return events;
}

export function eventToTimelineRow(event) {
  const label = EVENT_TYPE_LABELS[event.eventType] || event.eventType;
  const meta = event.metadata || {};
  const detail =
    meta.summary ||
    meta.detail ||
    meta.fileName ||
    meta.visitType ||
    meta.labName ||
    (event.linkedEntityId ? `Ref ${event.linkedEntityId}` : "");

  return {
    id: event.eventId,
    at: event.event_timestamp || event.timestamp,
    label,
    detail: String(detail),
    actor: event.actor,
    severity: event.severity,
    eventType: event.eventType,
    correlationId: event.correlationId,
    linkedEntityType: event.linkedEntityType,
    linkedEntityId: event.linkedEntityId,
    linkedLabId: event.linkedLabId,
    source: event.source,
  };
}
