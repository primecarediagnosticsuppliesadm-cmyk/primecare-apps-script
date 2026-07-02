/**
 * Shared HQ read coordinator — dedupe in-flight reads and unified cache invalidation.
 * Sprint 1: client-side only; no schema or business-rule changes.
 */
import { invalidateBoundedSourceCache } from "@/api/hqBoundedReads.js";
import {
  invalidateAdminDashboardReadCache,
  invalidateCollectionsReadCache,
  invalidateOrdersReadCache,
  invalidateQualificationReviewReadCache,
  invalidateStockDashboardReadResultCache,
} from "@/api/primecareSupabaseApi.js";
import { perfLog } from "@/utils/perfLog.js";

/** @type {Map<string, Promise<unknown>>} */
const inFlightByKey = new Map();

/**
 * Dedupe concurrent reads for the same logical key (e.g. tenant + surface).
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function coordinatedRead(key, fn) {
  const k = String(key || "").trim();
  if (!k) return fn();
  const existing = inFlightByKey.get(k);
  if (existing) {
    perfLog("hqReadCoordinator.join", { key: k });
    return existing;
  }
  const run = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (inFlightByKey.get(k) === run) {
        inFlightByKey.delete(k);
      }
    });
  inFlightByKey.set(k, run);
  return run;
}

/** Clear in-flight map only (TTL caches remain until TTL or explicit invalidate). */
export function clearHqReadCoordinatorInFlight() {
  inFlightByKey.clear();
}

/**
 * Invalidate all HQ read caches after financial sync / manual refresh.
 * @param {string|null} [tenantId]
 */
export function invalidateAllHqReads(tenantId = null) {
  clearHqReadCoordinatorInFlight();
  invalidateAdminDashboardReadCache();
  invalidateCollectionsReadCache();
  invalidateOrdersReadCache();
  invalidateQualificationReviewReadCache();
  invalidateStockDashboardReadResultCache();
  invalidateBoundedSourceCache();
  void import("@/operations/hqCommandCenterData.js").then((m) => {
    m.invalidateHqTodaysWorkCache();
  });
  void import("@/operations/operationsCommandCenterLoader.js").then((m) => {
    m.invalidateOperationsCommandCenterCache(tenantId);
  });
  perfLog("hqReadCoordinator.invalidateAll", { tenantId: tenantId || "all" });
}
