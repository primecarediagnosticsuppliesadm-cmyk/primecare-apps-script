/**
 * Build insert rows for notification_events.
 * Supports foundation schema (QA) and legacy GAP-006 stub (Production).
 */
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_EVENT_STATUSES,
} from "./notificationConstants.js";

function str(v) {
  return String(v ?? "").trim();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asUuidOrNull(v) {
  const s = str(v);
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function isKnownEventType(eventType) {
  return NOTIFICATION_EVENT_TYPES.includes(str(eventType));
}

function isKnownSeverity(severity) {
  return NOTIFICATION_SEVERITIES.includes(str(severity).toLowerCase());
}

function isKnownStatus(status) {
  return NOTIFICATION_EVENT_STATUSES.includes(str(status).toLowerCase());
}

const EVENT_TITLE = {
  agent_visit_logged: "Visit logged",
  qualification_updated: "Qualification updated",
  order_created: "Order created",
  order_fulfilled: "Order fulfilled",
  payment_received: "Payment received",
  collection_due: "Collection due",
  credit_hold_triggered: "Credit hold",
  low_stock: "Low stock",
  purchase_order_created: "PO created",
  purchase_order_received: "PO received",
};

/**
 * @param {object} event
 * @returns {{
 *   ok: boolean,
 *   error: string|null,
 *   eventType: string,
 *   tenantId: string|null,
 *   foundation: object|null,
 *   legacy: object|null,
 * }}
 */
export function buildNotificationEventInsertRows(event = {}) {
  const eventType = str(event.eventType ?? event.event_type);
  const tenantId = str(event.tenantId ?? event.tenant_id) || null;

  if (!tenantId) {
    return { ok: false, error: "tenantId is required", eventType, tenantId: null, foundation: null, legacy: null };
  }
  if (!isKnownEventType(eventType)) {
    return {
      ok: false,
      error: `Unknown event_type: ${eventType}`,
      eventType,
      tenantId,
      foundation: null,
      legacy: null,
    };
  }

  const actorRaw = event.actorUserId ?? event.actor_user_id;
  const actorUserId = asUuidOrNull(actorRaw);
  if (str(actorRaw) && !actorUserId) {
    // Explicit contract: never send AGT-* / non-UUID into uuid columns.
    // Drop rather than fail the side-effect (visit already committed).
  }

  const severity = isKnownSeverity(event.severity) ? str(event.severity).toLowerCase() : "info";
  const status = isKnownStatus(event.status) ? str(event.status).toLowerCase() : "pending";
  const payload = event.payload ?? event.payload_json ?? {};
  const sourceModule = str(event.sourceModule ?? event.source_module) || "system";
  const sourceId = str(event.sourceId ?? event.source_id) || null;
  const targetRole = str(event.targetRole ?? event.target_role) || null;
  const targetUserId = asUuidOrNull(event.targetUserId ?? event.target_user_id);
  const targetLabId = str(event.targetLabId ?? event.target_lab_id) || null;

  const title =
    str(event.title) ||
    EVENT_TITLE[eventType] ||
    eventType.replace(/_/g, " ");
  const message =
    str(event.message) ||
    (targetLabId
      ? `${title} for lab ${targetLabId}`
      : title);

  const foundation = {
    tenant_id: tenantId,
    event_type: eventType,
    source_module: sourceModule,
    source_id: sourceId,
    actor_user_id: actorUserId,
    target_role: targetRole,
    target_user_id: targetUserId,
    target_lab_id: targetLabId,
    payload_json: payload,
    severity,
    status,
  };

  /** GAP-006 Production stub columns only — no foundation fields. */
  const legacy = {
    tenant_id: tenantId,
    event_type: eventType,
    title,
    message,
    payload,
    severity,
    status,
  };

  return {
    ok: true,
    error: null,
    eventType,
    tenantId,
    foundation,
    legacy,
  };
}

/**
 * Payload shape used by createAgentVisitWrite → fireNotificationEvent.
 * @param {{ visitId: string, labId: string, tenantId: string, visitType?: string, visitDate?: string, userId?: string }} args
 */
export function buildAgentVisitLoggedNotificationEvent(args = {}) {
  return {
    eventType: "agent_visit_logged",
    sourceModule: "agent_visits",
    sourceId: str(args.visitId),
    tenantId: str(args.tenantId),
    targetLabId: str(args.labId) || null,
    targetRole: "admin",
    actorUserId: args.userId || args.user_id || null,
    severity: "info",
    payload: {
      visitId: str(args.visitId),
      labId: str(args.labId),
      visitType: str(args.visitType) || null,
      visitDate: str(args.visitDate) || null,
    },
  };
}

export function isUnknownNotificationColumnError(error) {
  const msg = str(error?.message || error);
  const code = str(error?.code);
  return (
    code === "PGRST204" ||
    /Could not find the '.*' column of 'notification_events'/i.test(msg) ||
    /column .*notification_events\..* does not exist/i.test(msg)
  );
}

/** LIVE QA-canonical delivery log columns (2026-08-16 OpenAPI probe). */
export const NOTIFICATION_DELIVERY_LOG_COLUMNS = [
  "delivery_id",
  "event_id",
  "tenant_id",
  "channel",
  "status",
  "provider_message_id",
  "provider_error",
  "attempted_at",
  "delivered_at",
  "created_at",
];

/**
 * Columns the app may send on INSERT (DB defaults cover delivery_id / created_at).
 * Intentionally excludes legacy-only fields: recipient, provider_response, error_message.
 */
export const NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS = [
  "event_id",
  "tenant_id",
  "channel",
  "status",
  "provider_message_id",
  "provider_error",
  "attempted_at",
  "delivered_at",
];

const DELIVERY_LOG_INSERT_KEY_SET = new Set(NOTIFICATION_DELIVERY_LOG_INSERT_COLUMNS);

/**
 * Build INSERT rows for notification_delivery_log matching LIVE QA schema.
 * Fire-and-forget side effect only — never part of visit transaction.
 * Output keys are allowlisted — never emit recipient / provider_response / error_message.
 *
 * @param {{ tenantId: string, eventId: string, channels?: string[], nowIso?: string }} args
 */
export function buildNotificationDeliveryLogInsertRows(args = {}) {
  const tenantId = str(args.tenantId);
  const eventId = str(args.eventId);
  const nowIso = str(args.nowIso) || new Date().toISOString();
  const channels = Array.isArray(args.channels) && args.channels.length
    ? args.channels
    : ["in_app", "email_placeholder", "whatsapp_placeholder", "sms_placeholder"];

  if (!tenantId || !eventId) {
    return { ok: false, error: "tenantId and eventId are required", rows: [] };
  }

  const rows = channels.map((channel) => {
    const ch = str(channel);
    const inApp = ch === "in_app";
    const row = {
      tenant_id: tenantId,
      event_id: eventId,
      channel: ch,
      status: inApp ? "logged_in_app" : "placeholder_not_sent",
      attempted_at: nowIso,
      delivered_at: inApp ? nowIso : null,
      provider_message_id: null,
      provider_error: null,
    };
    // Hard allowlist — drops any accidental legacy keys if this object is extended later.
    return Object.fromEntries(
      Object.entries(row).filter(([key]) => DELIVERY_LOG_INSERT_KEY_SET.has(key))
    );
  });

  return { ok: true, error: null, rows };
}
