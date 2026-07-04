/**
 * Sprint 7A shared read broker.
 *
 * Client-side only: wraps existing read APIs with scoped in-flight dedupe,
 * TTL cache reuse, explicit invalidation, and a consistent read-health envelope.
 * This module contains no mutation logic and performs no direct Supabase reads.
 */
import {
  getAgentVisitPageContextRead,
  getAgentWorkspaceRead,
  getCollectionDetailRead,
  getCollectionsRead,
  getLabCatalogRead,
  getLabQualificationRead,
  getLabVisitsRead,
  getLabsCredit,
  getOrderDetailsRead,
  getOrdersRead,
  getStockDashboard,
} from "@/api/primecareSupabaseApi.js";
import { getInvoiceDetailRead, getInvoicesForLabRead } from "@/api/invoiceSupabaseApi.js";
import {
  getLogisticsShipmentsRead,
  getShipmentByOrderRead,
  getShipmentEventsRead,
  getShipmentRouteAssignmentRead,
} from "@/api/logisticsSupabaseApi.js";
import { getNotificationEventsRead } from "@/api/notificationApi.js";
import { getLabOwnershipRead } from "@/api/labOwnershipApi.js";
import { loadLabOwnershipMetricsBundle } from "@/operations/operationsCenterAdminData.js";
import { perfLog } from "@/utils/perfLog.js";

export const SHARED_READ_BROKER_INVALIDATE_EVENT =
  "primecare:shared-read-broker:invalidate";

const DEFAULT_TTL_MS = 45_000;
const DETAIL_TTL_MS = 60_000;
const ROUTE_PREFETCH_TTL_MS = 30_000;

/** @type {Map<string, { at: number, envelope: object, source: string, scopeKey: string }>} */
const cacheByKey = new Map();
/** @type {Map<string, { promise: Promise<object>, source: string, scopeKey: string }>} */
const inFlightByKey = new Map();

const stats = {
  reads: 0,
  cacheHits: 0,
  inFlightJoins: 0,
  misses: 0,
  failures: 0,
  bySource: {},
};

let browserInvalidateBound = false;

function str(v) {
  return String(v ?? "").trim();
}

function stablePart(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return `[${value.map(stablePart).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stablePart(value[key])}`)
      .join("|")}}`;
  }
  return String(value);
}

function scopeFrom(options = {}, currentUser = null) {
  const user = currentUser || options.currentUser || {};
  return {
    tenantId: str(options.tenantId ?? options.tenant_id ?? user.tenantId ?? user.tenant_id),
    role: str(options.role ?? user.role).toLowerCase(),
    userId: str(options.userId ?? options.user_id ?? user.id ?? user.userId),
    labId: str(options.labId ?? options.lab_id ?? user.labId ?? user.lab_id),
    agentId: str(options.agentId ?? options.agent_id ?? user.agentId ?? user.agent_id),
  };
}

function scopeKey(scope = {}) {
  return [
    `tenant=${str(scope.tenantId) || "all"}`,
    `role=${str(scope.role) || "any"}`,
    `user=${str(scope.userId) || "any"}`,
    `lab=${str(scope.labId) || "any"}`,
    `agent=${str(scope.agentId) || "any"}`,
  ].join("|");
}

function cacheKeyFor(source, logicalKey, scope) {
  return `${source}:${scopeKey(scope)}:${stablePart(logicalKey) || "default"}`;
}

function record(source, field) {
  stats[field] = (stats[field] || 0) + 1;
  stats.bySource[source] ||= {
    reads: 0,
    cacheHits: 0,
    inFlightJoins: 0,
    misses: 0,
    failures: 0,
  };
  stats.bySource[source][field] = (stats.bySource[source][field] || 0) + 1;
}

function selectDefaultData(raw, fallbackData) {
  if (raw && typeof raw === "object") {
    if ("data" in raw) return raw.data;
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.shipments)) return raw.shipments;
    if (Array.isArray(raw.events)) return raw.events;
    if ("shipment" in raw) return raw.shipment;
    if ("assignment" in raw) return raw.assignment;
  }
  return raw ?? fallbackData ?? null;
}

function decorateRawResult(envelope) {
  const raw = envelope.raw && typeof envelope.raw === "object" && !Array.isArray(envelope.raw)
    ? envelope.raw
    : null;
  const base = raw ? { ...raw } : {};
  const success = base.success ?? envelope.success;
  const readFailed = base.readFailed ?? envelope.readFailed;
  const degraded = base.degraded ?? envelope.degraded;
  return {
    ...base,
    success,
    data: base.data ?? envelope.data,
    degraded,
    readFailed,
    source: base.source ?? envelope.source,
    durationMs: envelope.durationMs,
    cacheHit: envelope.cacheHit,
    fromCache: envelope.fromCache,
    error: base.error ?? envelope.error ?? null,
    broker: {
      source: envelope.source,
      cacheKey: envelope.cacheKey,
      cacheHit: envelope.cacheHit,
      inFlightJoin: envelope.inFlightJoin,
      durationMs: envelope.durationMs,
      loadedAt: envelope.loadedAt,
    },
  };
}

async function brokerRead({
  source,
  logicalKey = "",
  scope = {},
  ttlMs = DEFAULT_TTL_MS,
  force = false,
  loader,
  selectData,
  fallbackData = null,
}) {
  const scoped = scopeKey(scope);
  const key = cacheKeyFor(source, logicalKey, scope);
  const now = Date.now();
  stats.reads += 1;
  record(source, "reads");

  if (!force) {
    const cached = cacheByKey.get(key);
    if (cached && now - cached.at < ttlMs) {
      stats.cacheHits += 1;
      record(source, "cacheHits");
      perfLog("sharedReadBroker.cacheHit", { source, ageMs: now - cached.at });
      return {
        ...cached.envelope,
        cacheHit: true,
        fromCache: true,
        inFlightJoin: false,
        durationMs: 0,
      };
    }
  }

  const inFlightKey = force ? `${key}:force` : key;
  const existing = inFlightByKey.get(inFlightKey);
  if (existing) {
    stats.inFlightJoins += 1;
    record(source, "inFlightJoins");
    perfLog("sharedReadBroker.inFlightJoin", { source });
    const joined = await existing.promise;
    return { ...joined, inFlightJoin: true };
  }

  stats.misses += 1;
  record(source, "misses");

  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const promise = Promise.resolve()
    .then(loader)
    .then((raw) => {
      const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
      const success = raw?.success !== false && raw?.readFailed !== true;
      const data = typeof selectData === "function"
        ? selectData(raw)
        : selectDefaultData(raw, fallbackData);
      const envelope = {
        success,
        data: data ?? fallbackData,
        degraded: raw?.degraded === true || raw?.readFailed === true || !success,
        readFailed: raw?.readFailed === true || !success,
        source,
        durationMs,
        cacheHit: false,
        fromCache: false,
        inFlightJoin: false,
        error: raw?.error || null,
        raw,
        cacheKey: key,
        loadedAt: Date.now(),
      };
      if (success && !force) {
        cacheByKey.set(key, { at: Date.now(), envelope, source, scopeKey: scoped });
      }
      return envelope;
    })
    .catch((err) => {
      stats.failures += 1;
      record(source, "failures");
      return {
        success: false,
        data: fallbackData,
        degraded: true,
        readFailed: true,
        source,
        durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started),
        cacheHit: false,
        fromCache: false,
        inFlightJoin: false,
        error: err?.message || String(err),
        raw: null,
        cacheKey: key,
        loadedAt: Date.now(),
      };
    })
    .finally(() => {
      if (inFlightByKey.get(inFlightKey)?.promise === promise) {
        inFlightByKey.delete(inFlightKey);
      }
    });

  inFlightByKey.set(inFlightKey, { promise, source, scopeKey: scoped });
  return promise;
}

async function readViaBroker(config) {
  const envelope = await brokerRead(config);
  return decorateRawResult(envelope);
}

export function readBrokerProbe(config = {}) {
  return readViaBroker({
    source: config.source || "broker-probe",
    logicalKey: config.logicalKey || "probe",
    scope: config.scope || {},
    ttlMs: Number(config.ttlMs) > 0 ? Number(config.ttlMs) : DEFAULT_TTL_MS,
    force: config.force === true,
    loader: config.loader,
    selectData: config.selectData,
    fallbackData: config.fallbackData ?? null,
  });
}

export function invalidateSharedReadBroker(match = {}) {
  const source = str(match.source);
  const tenantId = str(match.tenantId ?? match.tenant_id);
  const role = str(match.role).toLowerCase();
  const userId = str(match.userId ?? match.user_id);
  const labId = str(match.labId ?? match.lab_id);
  const agentId = str(match.agentId ?? match.agent_id);
  const scopeNeedles = [
    tenantId ? `tenant=${tenantId}` : "",
    role ? `role=${role}` : "",
    userId ? `user=${userId}` : "",
    labId ? `lab=${labId}` : "",
    agentId ? `agent=${agentId}` : "",
  ].filter(Boolean);

  function shouldDelete(entry) {
    if (source && entry.source !== source) return false;
    return scopeNeedles.every((needle) => entry.scopeKey.includes(needle));
  }

  for (const [key, entry] of cacheByKey.entries()) {
    if (shouldDelete(entry)) cacheByKey.delete(key);
  }
  for (const [key, entry] of inFlightByKey.entries()) {
    if (shouldDelete(entry)) inFlightByKey.delete(key);
  }
  perfLog("sharedReadBroker.invalidate", {
    source: source || "all",
    tenantId: tenantId || "all",
    role: role || "all",
  });
}

export function emitSharedReadBrokerInvalidation(detail = {}) {
  invalidateSharedReadBroker(detail);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SHARED_READ_BROKER_INVALIDATE_EVENT, { detail }));
  }
}

export function getSharedReadBrokerStats() {
  return {
    ...stats,
    bySource: Object.fromEntries(
      Object.entries(stats.bySource).map(([source, value]) => [source, { ...value }])
    ),
    cacheEntries: cacheByKey.size,
    inFlightEntries: inFlightByKey.size,
  };
}

export function resetSharedReadBrokerStats({ clearCache = false } = {}) {
  stats.reads = 0;
  stats.cacheHits = 0;
  stats.inFlightJoins = 0;
  stats.misses = 0;
  stats.failures = 0;
  stats.bySource = {};
  if (clearCache) {
    cacheByKey.clear();
    inFlightByKey.clear();
  }
}

export function bindSharedReadBrokerInvalidationEvent() {
  if (typeof window === "undefined" || browserInvalidateBound) return;
  browserInvalidateBound = true;
  window.addEventListener(SHARED_READ_BROKER_INVALIDATE_EVENT, (event) => {
    invalidateSharedReadBroker(event?.detail || {});
  });
}

export function readLabsCreditBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "labs-credit",
    logicalKey: { tenantId: scope.tenantId },
    scope,
    force: options.force === true,
    loader: () => getLabsCredit(options),
    selectData: (raw) => raw?.data ?? [],
    fallbackData: [],
  });
}

export function readCollectionsBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "collections-summary",
    logicalKey: {
      tenantId: scope.tenantId,
      limit: options.limit,
      daysBack: options.daysBack,
    },
    scope,
    force: options.force === true,
    loader: () => getCollectionsRead(options),
    selectData: (raw) => raw?.data ?? { summary: {}, collections: [] },
    fallbackData: { summary: {}, collections: [] },
  });
}

export function readAgentWorkspaceBroker(currentUser, options = {}) {
  const scope = scopeFrom(options, currentUser);
  return readViaBroker({
    source: "agent-workspace",
    logicalKey: { tenantId: scope.tenantId, userId: scope.userId, agentId: scope.agentId },
    scope,
    force: options.force === true,
    loader: () => getAgentWorkspaceRead(currentUser, options),
    selectData: (raw) => raw?.data ?? {},
    fallbackData: {},
  });
}

export function readAgentVisitContextBroker(currentUser, options = {}) {
  const scope = scopeFrom(options, currentUser);
  return readViaBroker({
    source: "agent-visit-context",
    logicalKey: { tenantId: scope.tenantId, userId: scope.userId, agentId: scope.agentId },
    scope,
    force: options.force === true,
    loader: () => getAgentVisitPageContextRead(currentUser),
    selectData: (raw) => raw?.data ?? { labs: [], recentVisits: [], collections: [] },
    fallbackData: { labs: [], recentVisits: [], collections: [] },
  });
}

export function readLogisticsShipmentsBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "logistics-shipments",
    logicalKey: { tenantId: scope.tenantId, limit: options.limit || 500 },
    scope,
    force: options.force === true,
    loader: () => getLogisticsShipmentsRead(options),
    selectData: (raw) => raw?.shipments ?? [],
    fallbackData: [],
  });
}

export function readStockDashboardBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "stock-dashboard",
    logicalKey: { tenantId: scope.tenantId },
    scope,
    force: options.force === true,
    loader: () => getStockDashboard(options),
    selectData: (raw) => raw?.data ?? { stats: {}, inventory: [] },
    fallbackData: { stats: {}, inventory: [] },
  });
}

export function readOrdersListBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "orders-list",
    logicalKey: {
      tenantId: scope.tenantId,
      limit: options.limit,
      offset: options.offset,
      skipLineCounts: options.skipLineCounts,
      daysBack: options.daysBack,
    },
    scope,
    force: options.force === true,
    loader: () => getOrdersRead(options),
    selectData: (raw) => raw?.data ?? { orders: [] },
    fallbackData: { orders: [] },
  });
}

export function readNotificationEventsBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "notification-events",
    logicalKey: { ...options, currentUser: undefined },
    scope,
    ttlMs: ROUTE_PREFETCH_TTL_MS,
    force: options.force === true,
    loader: () => getNotificationEventsRead(options),
    selectData: (raw) => raw?.data ?? [],
    fallbackData: [],
  });
}

export function readLabOwnershipBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "lab-ownership",
    logicalKey: { tenantId: scope.tenantId, status: options.status || "ACTIVE" },
    scope,
    force: options.force === true,
    loader: () => getLabOwnershipRead(options),
    selectData: (raw) => raw?.data ?? { rows: [] },
    fallbackData: { rows: [] },
  });
}

export function readLabOwnershipBundleBroker(tenantId, options = {}) {
  const scope = scopeFrom({ ...options, tenantId });
  return readViaBroker({
    source: "lab-ownership-bundle",
    logicalKey: { tenantId: scope.tenantId },
    scope,
    force: options.force === true,
    loader: () => loadLabOwnershipMetricsBundle(tenantId),
    selectData: (raw) => raw ?? null,
    fallbackData: null,
  });
}

export function readLabCatalogBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "lab-catalog",
    logicalKey: { tenantId: scope.tenantId, labId: scope.labId },
    scope,
    force: options.force === true,
    loader: () => getLabCatalogRead(options),
    selectData: (raw) => raw?.data ?? raw?.products ?? [],
    fallbackData: [],
  });
}

export function readOrderDetailBroker(orderId, options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "order-detail",
    logicalKey: { orderId },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getOrderDetailsRead(orderId),
    selectData: (raw) => raw?.data ?? { order: null, lines: [] },
    fallbackData: { order: null, lines: [] },
  });
}

export function readInvoiceDetailBroker(invoiceId, options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "invoice-detail",
    logicalKey: { invoiceId },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getInvoiceDetailRead(invoiceId),
    selectData: (raw) => raw?.data ?? { invoice: null, lines: [] },
    fallbackData: { invoice: null, lines: [] },
  });
}

export function readLabInvoicesBroker(labId, options = {}) {
  const scope = scopeFrom({ ...options, labId });
  return readViaBroker({
    source: "lab-invoices",
    logicalKey: { labId, tenantId: scope.tenantId, pageSize: options.pageSize },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getInvoicesForLabRead(labId, options),
    selectData: (raw) => raw?.rows ?? raw?.data ?? [],
    fallbackData: [],
  });
}

export function readCollectionDetailBroker(labId, options = {}) {
  const scope = scopeFrom({ ...options, labId });
  return readViaBroker({
    source: "collection-detail",
    logicalKey: { labId },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getCollectionDetailRead(labId),
    selectData: (raw) => raw?.data ?? { collection: null },
    fallbackData: { collection: null },
  });
}

export function readLabVisitsBroker(labId, options = {}) {
  const scope = scopeFrom({ ...options, labId });
  return readViaBroker({
    source: "lab-visits",
    logicalKey: { tenantId: scope.tenantId, labId: scope.labId, limit: options.limit || 100 },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getLabVisitsRead({ ...options, labId }),
    selectData: (raw) => raw?.data ?? { visits: [] },
    fallbackData: { visits: [] },
  });
}

export function readLabQualificationBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "lab-qualification",
    logicalKey: { tenantId: scope.tenantId, labId: scope.labId },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getLabQualificationRead(options),
    selectData: (raw) => raw?.data ?? null,
    fallbackData: null,
  });
}

export function readShipmentEventsBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "shipment-events",
    logicalKey: { tenantId: scope.tenantId, shipmentId: options.shipmentId },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getShipmentEventsRead(options),
    selectData: (raw) => raw?.events ?? [],
    fallbackData: [],
  });
}

export function readShipmentRouteAssignmentBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "shipment-route-assignment",
    logicalKey: { shipmentId: options.shipmentId },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getShipmentRouteAssignmentRead(options),
    selectData: (raw) => raw?.assignment ?? null,
    fallbackData: null,
  });
}

export function readShipmentByOrderBroker(options = {}) {
  const scope = scopeFrom(options);
  return readViaBroker({
    source: "shipment-by-order",
    logicalKey: { tenantId: scope.tenantId, orderId: options.orderId },
    scope,
    ttlMs: DETAIL_TTL_MS,
    force: options.force === true,
    loader: () => getShipmentByOrderRead(options),
    selectData: (raw) => raw?.shipment ?? null,
    fallbackData: null,
  });
}

function scheduleIdle(task) {
  if (typeof window === "undefined") return () => {};
  let cancelled = false;
  const run = () => {
    if (!cancelled) void Promise.resolve().then(task);
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 2500 });
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(run, 500);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
}

export function prefetchBrokerRead(readFn, args = []) {
  const list = Array.isArray(args) ? args : [args];
  return scheduleIdle(() => readFn(...list).catch(() => null));
}

export function prefetchSharedRouteData(role, pageKey, currentUser = null) {
  const normalizedRole = str(role).toLowerCase();
  const key = str(pageKey);
  const tenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const labId = str(currentUser?.labId || currentUser?.lab_id);

  if (!tenantId && normalizedRole !== "lab") return () => {};

  return scheduleIdle(() => {
    if (normalizedRole === "admin" || normalizedRole === "executive") {
      const common = { tenantId, role: normalizedRole, currentUser };
      if (key === "orders") return readOrdersListBroker({ ...common, skipLineCounts: true }).catch(() => null);
      if (key === "labs") return readLabsCreditBroker(common).catch(() => null);
      if (key === "collections" || key === "risk") return readCollectionsBroker(common).catch(() => null);
      if (key === "logisticsDelivery") return readLogisticsShipmentsBroker(common).catch(() => null);
      if (key === "inventory") return readStockDashboardBroker(common).catch(() => null);
      if (key === "operationsCenter") {
        return Promise.all([
          readOrdersListBroker({ ...common, skipLineCounts: true }),
          readCollectionsBroker(common),
          readStockDashboardBroker(common),
          readNotificationEventsBroker({ ...common, limit: 60 }),
        ]).catch(() => null);
      }
      if (key === "executiveFinancialIntelligence") {
        return Promise.all([
          readCollectionsBroker(common),
          readOrdersListBroker({ ...common, skipLineCounts: true }),
          readLogisticsShipmentsBroker(common),
        ]).catch(() => null);
      }
    }

    if (normalizedRole === "agent") {
      if (key === "dashboard") {
        return Promise.all([
          readAgentWorkspaceBroker(currentUser, {}),
          readNotificationEventsBroker({ tenantId, role: normalizedRole, currentUser, limit: 12 }),
        ]).catch(() => null);
      }
      if (key === "collections") {
        return readCollectionsBroker({ tenantId, role: normalizedRole, currentUser }).catch(() => null);
      }
      if (key === "visits") {
        return readAgentVisitContextBroker(currentUser, {}).catch(() => null);
      }
    }

    if (normalizedRole === "lab") {
      if (key === "labOrders") {
        return readLabCatalogBroker({ tenantId, labId, role: normalizedRole, currentUser }).catch(() => null);
      }
      if (key === "labInvoices" && labId) {
        return readLabInvoicesBroker(labId, { tenantId, role: normalizedRole, currentUser }).catch(() => null);
      }
    }

    return null;
  });
}

bindSharedReadBrokerInvalidationEvent();
