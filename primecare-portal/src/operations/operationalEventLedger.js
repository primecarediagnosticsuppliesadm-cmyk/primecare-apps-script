/**
 * Append-only operational event ledger (local primary + optional Supabase via notifications).
 */

import { OPERATIONAL_EVENT_TYPES } from "@/operations/operationalEventTypes.js";

const LEDGER_PREFIX = "primecare_operational_ledger_v1";
const PENDING_PREFIX = "primecare_operational_ledger_pending_v1";
const MAX_LEDGER_EVENTS = 400;
const MAX_PENDING = 80;

function str(v) {
  return String(v ?? "").trim();
}

function ledgerKey(tenantId) {
  return `${LEDGER_PREFIX}:${str(tenantId) || "default"}`;
}

function pendingKey(tenantId) {
  return `${PENDING_PREFIX}:${str(tenantId) || "default"}`;
}

function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function newEventId() {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @returns {object[]}
 */
export function readOperationalLedger(tenantId) {
  const rows = readJson(ledgerKey(tenantId), []);
  return Array.isArray(rows) ? rows : [];
}

function writeOperationalLedger(tenantId, rows) {
  writeJson(ledgerKey(tenantId), rows.slice(0, MAX_LEDGER_EVENTS));
}

export function readPendingOperationalEvents(tenantId) {
  const rows = readJson(pendingKey(tenantId), []);
  return Array.isArray(rows) ? rows : [];
}

function writePendingOperationalEvents(tenantId, rows) {
  writeJson(pendingKey(tenantId), rows.slice(0, MAX_PENDING));
}

/**
 * Append event (immutable). Returns stored event or null if deduped.
 */
export function appendOperationalLedgerEvent(tenantId, partial) {
  const eventType = str(partial.eventType);
  if (!OPERATIONAL_EVENT_TYPES.includes(eventType)) return null;

  const event = {
    eventId: str(partial.eventId) || newEventId(),
    tenantId: str(tenantId),
    eventType,
    severity: partial.severity || "MONITORING",
    actor: str(partial.actor) || "System",
    actorRole: str(partial.actorRole) || "",
    linkedEntityType: str(partial.linkedEntityType) || "",
    linkedEntityId: str(partial.linkedEntityId) || "",
    linkedLabId: str(partial.linkedLabId) || "",
    linkedAgentId: str(partial.linkedAgentId) || "",
    timestamp: partial.timestamp || new Date().toISOString(),
    metadata: partial.metadata && typeof partial.metadata === "object" ? partial.metadata : {},
    correlationId: str(partial.correlationId) || "",
    dedupeKey: str(partial.dedupeKey) || "",
    source: partial.source || "local",
  };

  const ledger = readOperationalLedger(tenantId);
  if (event.dedupeKey) {
    const exists = ledger.some((e) => e.dedupeKey === event.dedupeKey);
    if (exists) return null;
  }

  ledger.unshift(event);
  writeOperationalLedger(tenantId, ledger);
  return event;
}

export function queuePendingOperationalEvent(tenantId, event) {
  const pending = readPendingOperationalEvents(tenantId);
  pending.push({ ...event, queuedAt: new Date().toISOString() });
  writePendingOperationalEvents(tenantId, pending);
}

export function removePendingOperationalEvent(tenantId, eventId) {
  const pending = readPendingOperationalEvents(tenantId).filter((e) => e.eventId !== eventId);
  writePendingOperationalEvents(tenantId, pending);
}

/**
 * Query ledger with filters (newest first).
 */
export function queryOperationalLedger(tenantId, filters = {}, limit = 48) {
  let rows = readOperationalLedger(tenantId);

  if (filters.linkedEntityType) {
    rows = rows.filter((e) => e.linkedEntityType === filters.linkedEntityType);
  }
  if (filters.linkedEntityId) {
    rows = rows.filter((e) => e.linkedEntityId === filters.linkedEntityId);
  }
  if (filters.linkedLabId) {
    rows = rows.filter((e) => e.linkedLabId === filters.linkedLabId);
  }
  if (filters.linkedAgentId) {
    rows = rows.filter((e) => e.linkedAgentId === filters.linkedAgentId);
  }
  if (filters.correlationId) {
    rows = rows.filter((e) => e.correlationId === filters.correlationId);
  }
  if (filters.eventTypes?.length) {
    const set = new Set(filters.eventTypes);
    rows = rows.filter((e) => set.has(e.eventType));
  }

  rows.sort((a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || ""));
  return rows.slice(0, limit);
}

export function ledgerDedupeKeys(tenantId) {
  return new Set(readOperationalLedger(tenantId).map((e) => e.dedupeKey).filter(Boolean));
}
