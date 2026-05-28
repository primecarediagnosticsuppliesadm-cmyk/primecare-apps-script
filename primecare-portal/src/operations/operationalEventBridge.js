import { NOTIFICATION_EVENT_MAP } from "@/operations/operationalEventTypes.js";
import {
  appendOperationalLedgerEvent,
  queuePendingOperationalEvent,
  readPendingOperationalEvents,
  removePendingOperationalEvent,
} from "@/operations/operationalEventLedger.js";
import { ledgerDedupeKeys } from "@/operations/operationalEventLedger.js";
import { synthesizeEventsFromPayload } from "@/operations/operationalEventIngest.js";
import { createNotificationEvent } from "@/notifications/createNotificationEvent.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Append operational event (append-only) + optional durable notification sync.
 */
export async function appendOperationalEvent(partial) {
  const tenantId = str(partial.tenantId);
  if (!tenantId) return null;

  const stored = appendOperationalLedgerEvent(tenantId, partial);
  if (!stored) return null;

  const notifType = NOTIFICATION_EVENT_MAP[stored.eventType];
  if (notifType) {
    try {
      const res = await createNotificationEvent({
        tenantId,
        eventType: notifType,
        sourceModule: partial.sourceModule || "operations",
        sourceId: stored.linkedEntityId || stored.eventId,
        actorUserId: partial.actorUserId || "",
        targetLabId: stored.linkedLabId || "",
        payload: {
          operationalEventId: stored.eventId,
          operationalEventType: stored.eventType,
          message: partial.metadata?.summary || stored.eventType,
          ...stored.metadata,
        },
        severity: mapSeverityForNotification(stored.severity),
      });
      if (!res?.success) {
        queuePendingOperationalEvent(tenantId, { ...stored, syncTarget: "notification_events" });
      }
    } catch {
      queuePendingOperationalEvent(tenantId, { ...stored, syncTarget: "notification_events" });
    }
  }

  return stored;
}

function mapSeverityForNotification(severity) {
  const s = str(severity).toUpperCase();
  if (s === "CRITICAL") return "critical";
  if (s === "ATTENTION") return "high";
  return "info";
}

/**
 * Replay pending events after reconnect / page load.
 */
export async function flushPendingOperationalEvents(tenantId) {
  const pending = readPendingOperationalEvents(tenantId);
  for (const evt of pending) {
    const notifType = NOTIFICATION_EVENT_MAP[evt.eventType];
    if (!notifType) {
      removePendingOperationalEvent(tenantId, evt.eventId);
      continue;
    }
    try {
      const res = await createNotificationEvent({
        tenantId,
        eventType: notifType,
        sourceModule: "operations",
        sourceId: evt.linkedEntityId || evt.eventId,
        payload: evt.metadata || {},
        severity: mapSeverityForNotification(evt.severity),
      });
      if (res?.success) removePendingOperationalEvent(tenantId, evt.eventId);
    } catch {
      /* keep in queue */
    }
  }
}

/**
 * Seed ledger from payload once per session (synthetic, deduped).
 */
export function backfillOperationalLedgerFromPayload(tenantId, payload) {
  if (!tenantId || !payload) return 0;
  const dedupe = ledgerDedupeKeys(tenantId);
  const synthetic = synthesizeEventsFromPayload(payload, dedupe);
  let added = 0;
  for (const e of synthetic.slice(0, 60)) {
    const stored = appendOperationalLedgerEvent(tenantId, e);
    if (stored) added += 1;
  }
  return added;
}

/** Intervention action → ledger event */
export function emitInterventionLedgerEvent({ tenantId, issue, action, actor, actorRole, assignTo }) {
  const map = {
    assign_owner: "task_assigned",
    escalate: "intervention_escalated",
    mark_reviewed: "intervention_acknowledged",
    request_followup: "escalation_created",
    require_proof: "proof_uploaded",
    resolve: "intervention_resolved",
    reopen: "intervention_created",
    snooze: "escalation_acknowledged",
  };
  const eventType = map[action] || "intervention_created";
  return appendOperationalEvent({
    tenantId,
    eventType,
    severity: issue?.displaySeverity || issue?.severity || "MONITORING",
    actor,
    actorRole,
    linkedEntityType: "intervention",
    linkedEntityId: issue?.id,
    linkedLabId: issue?.labId,
    linkedAgentId: assignTo || issue?.owner,
    correlationId: issue?.labId ? `lab:${issue.labId}` : `intervention:${issue?.id}`,
    metadata: {
      summary: issue?.summary || issue?.title,
      action,
      labName: issue?.labName,
    },
    dedupeKey: `intervention:${issue?.id}:${action}:${new Date().toISOString().slice(0, 16)}`,
    sourceModule: "executive_intervention",
  });
}

/** Task action → ledger event */
export function emitTaskLedgerEvent({ tenantId, task, action, actor, actorRole, assignTo }) {
  const map = {
    assign: "task_assigned",
    reassign: "task_assigned",
    escalate: "task_escalated",
    acknowledge: "escalation_acknowledged",
    complete: "task_completed",
    reopen: "task_created",
    request_evidence: "proof_uploaded",
  };
  const eventType = map[action] || "task_created";
  return appendOperationalEvent({
    tenantId,
    eventType,
    severity: task?.displaySeverity || task?.severity || "MONITORING",
    actor,
    actorRole,
    linkedEntityType: "task",
    linkedEntityId: task?.taskId,
    linkedLabId: task?.linkedLabId,
    linkedAgentId: assignTo || task?.assignee,
    correlationId: task?.linkedInterventionId
      ? `intervention:${task.linkedInterventionId}`
      : task?.linkedLabId
        ? `lab:${task.linkedLabId}`
        : "",
    metadata: { summary: task?.summary, action, labName: task?.linkedLabName },
    dedupeKey: `task:${task?.taskId}:${action}:${new Date().toISOString().slice(0, 16)}`,
    sourceModule: "operational_tasks",
  });
}
