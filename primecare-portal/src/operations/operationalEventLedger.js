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

function newEventId(sequence) {
  const seq = Number(sequence) || Date.now();
  return `evt-${seq}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseTimeMs(iso) {
  const ms = Date.parse(str(iso));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Stable sequence from event id (`evt-<ms>-...`) or explicit sequence field.
 */
export function sequenceFromEventId(eventId) {
  const m = str(eventId).match(/^evt-(\d+)-/);
  return m ? Number(m[1]) : 0;
}

/**
 * Read-time normalization only — does not write back to storage.
 */
export function normalizeLedgerEventForRead(event, fallbackSequence = 0) {
  const seq =
    Number(event?.sequence) ||
    sequenceFromEventId(event?.eventId) ||
    Number(fallbackSequence) ||
    0;

  const event_timestamp =
    str(event?.event_timestamp) ||
    str(event?.timestamp) ||
    (seq > 0 ? new Date(seq).toISOString() : "");

  const inserted_at =
    str(event?.inserted_at) ||
    event_timestamp ||
    str(event?.timestamp) ||
    (seq > 0 ? new Date(seq).toISOString() : "");

  return {
    ...event,
    event_timestamp,
    inserted_at,
    sequence: seq,
    timestamp: str(event?.timestamp) || event_timestamp,
  };
}

/**
 * Newest first: event_timestamp → inserted_at → sequence → eventId.
 */
export function compareOperationalEventsDesc(a, b) {
  const tsA = parseTimeMs(a?.event_timestamp);
  const tsB = parseTimeMs(b?.event_timestamp);
  if (tsB !== tsA) return tsB - tsA;

  const insA = parseTimeMs(a?.inserted_at);
  const insB = parseTimeMs(b?.inserted_at);
  if (insB !== insA) return insB - insA;

  const seqA = Number(a?.sequence) || sequenceFromEventId(a?.eventId) || 0;
  const seqB = Number(b?.sequence) || sequenceFromEventId(b?.eventId) || 0;
  if (seqB !== seqA) return seqB - seqA;

  return str(b?.eventId).localeCompare(str(a?.eventId));
}

/**
 * @param {object[]} rows
 * @returns {object[]}
 */
export function sortOperationalLedgerEvents(rows) {
  return [...(rows || [])].sort(compareOperationalEventsDesc);
}

/**
 * @param {object[]} rows
 */
export function isOperationalLedgerOrdered(rows) {
  const list = rows || [];
  if (list.length < 2) return true;
  for (let i = 0; i < list.length - 1; i += 1) {
    if (compareOperationalEventsDesc(list[i], list[i + 1]) > 0) return false;
  }
  return true;
}

/**
 * @returns {object[]}
 */
export function readOperationalLedger(tenantId) {
  const rows = readJson(ledgerKey(tenantId), []);
  const raw = Array.isArray(rows) ? rows : [];
  const normalized = raw.map((e, index) => normalizeLedgerEventForRead(e, raw.length - index));
  return sortOperationalLedgerEvents(normalized);
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

  const insertedAt = new Date().toISOString();
  const sequence = Number(partial.sequence) || Date.now();
  const eventTimestamp =
    str(partial.event_timestamp) || str(partial.timestamp) || insertedAt;

  const event = {
    eventId: str(partial.eventId) || newEventId(sequence),
    tenantId: str(tenantId),
    eventType,
    severity: partial.severity || "MONITORING",
    actor: str(partial.actor) || "System",
    actorRole: str(partial.actorRole) || "",
    linkedEntityType: str(partial.linkedEntityType) || "",
    linkedEntityId: str(partial.linkedEntityId) || "",
    linkedLabId: str(partial.linkedLabId) || "",
    linkedAgentId: str(partial.linkedAgentId) || "",
    event_timestamp: eventTimestamp,
    inserted_at: str(partial.inserted_at) || insertedAt,
    sequence,
    timestamp: str(partial.timestamp) || eventTimestamp,
    metadata: partial.metadata && typeof partial.metadata === "object" ? partial.metadata : {},
    correlationId: str(partial.correlationId) || "",
    dedupeKey: str(partial.dedupeKey) || "",
    source: partial.source || "local",
  };

  const ledger = readJson(ledgerKey(tenantId), []);
  const raw = Array.isArray(ledger) ? ledger : [];
  if (event.dedupeKey) {
    const exists = raw.some((e) => e.dedupeKey === event.dedupeKey);
    if (exists) return null;
  }

  raw.unshift(event);
  writeOperationalLedger(tenantId, raw);
  return normalizeLedgerEventForRead(event, sequence);
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
  let rows = readOperationalLedger(tenantId); // already normalized + sorted

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

  rows = sortOperationalLedgerEvents(rows);
  return rows.slice(0, limit);
}

export function ledgerDedupeKeys(tenantId) {
  return new Set(readOperationalLedger(tenantId).map((e) => e.dedupeKey).filter(Boolean));
}
