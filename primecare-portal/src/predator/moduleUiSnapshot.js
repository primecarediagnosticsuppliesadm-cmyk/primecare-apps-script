import { predatorStore } from "@/predator/predatorStore.js";

export const MODULE_UI_SNAPSHOT_FRESHNESS_MS = 2 * 60 * 1000;

export const COLLECTIONS_MODULE = "Collections";
export const QUALIFICATION_REVIEW_MODULE = "Qualification Analytics";

/**
 * Page-observed Collections snapshot (may legitimately be zero).
 * @param {{ summary?: object, collections?: unknown[] }|null|undefined} rendered
 */
export function hasObservedCollectionsSnapshot(rendered) {
  if (!rendered) return false;
  return Array.isArray(rendered.collections) || rendered.summary != null;
}

/**
 * @param {{ summary?: object, collections?: unknown[], collectionsListCount?: number, outstandingReceivables?: number }|null|undefined} rendered
 */
export function hasVisibleCollectionsSnapshot(rendered) {
  if (!hasObservedCollectionsSnapshot(rendered)) return false;
  const listCount = Number(
    rendered.collectionsListCount ??
      (Array.isArray(rendered.collections) ? rendered.collections.length : 0)
  );
  const outstanding = Number(
    rendered.outstandingReceivables ?? rendered.summary?.totalOutstanding ?? 0
  );
  return listCount > 0 || outstanding > 0;
}

/**
 * Page-observed Qualification snapshot (may legitimately be zero).
 * @param {{ rowCount?: number, qualificationRowsCount?: number }|null|undefined} rendered
 */
export function hasObservedQualificationSnapshot(rendered) {
  if (!rendered) return false;
  return (
    rendered.qualificationRowsCount != null ||
    rendered.rowCount != null ||
    Array.isArray(rendered.rows)
  );
}

/**
 * @param {{ rowCount?: number, qualificationRowsCount?: number }|null|undefined} rendered
 */
export function hasVisibleQualificationSnapshot(rendered) {
  if (!hasObservedQualificationSnapshot(rendered)) return false;
  const count = Number(rendered.qualificationRowsCount ?? rendered.rowCount ?? 0);
  return count > 0;
}

/**
 * @param {string} moduleName
 * @param {object} snapshot
 * @param {(value: object) => boolean} hasVisible
 * @param {{ source?: string }} [meta]
 */
export function recordModuleRenderedSnapshot(moduleName, snapshot, isObserved, meta = {}) {
  if (!snapshot || !isObserved(snapshot)) return;

  predatorStore.setModuleRenderedSnapshot(moduleName, {
    snapshot,
    source: meta.source || `${moduleName}.render`,
    capturedAt: Date.now(),
    kpiModel: null,
  });
}

/**
 * @param {Object} params
 * @param {string} params.moduleName
 * @param {object|null|undefined} [params.explicitRendered]
 * @param {(value: object) => boolean} params.isObserved
 * @param {string} params.missingMessage
 * @param {string} [params.expiredMessagePrefix]
 * @param {string} [params.staleZeroMessage]
 * @param {number} [params.apiValidatedAt]
 */
export function resolveModuleUiSnapshot({
  moduleName,
  explicitRendered = null,
  isObserved,
  missingMessage,
  expiredMessagePrefix,
  staleZeroMessage,
  apiValidatedAt,
}) {
  const now = Date.now();
  const stored = predatorStore.getModuleRenderedSnapshot(moduleName);

  if (explicitRendered && isObserved(explicitRendered)) {
    if (apiValidatedAt != null) {
      predatorStore.setModuleApiValidationAt(moduleName, apiValidatedAt);
    }
    return {
      fresh: true,
      rendered: explicitRendered,
      reason: null,
      message: null,
      ageMs: 0,
      source: "explicit.passed",
      capturedAt: stored?.capturedAt ?? now,
      apiValidatedAt: apiValidatedAt ?? null,
    };
  }

  const candidate = stored?.snapshot
    ? {
        snapshot: stored.snapshot,
        source: stored.source || "unknown",
        capturedAt: stored.capturedAt,
      }
    : null;

  if (!candidate) {
    return {
      fresh: false,
      rendered: null,
      reason: "missing",
      message: missingMessage,
      ageMs: null,
      source: null,
      capturedAt: null,
      apiValidatedAt: apiValidatedAt ?? null,
    };
  }

  const ageMs = now - candidate.capturedAt;
  const observed = isObserved(candidate.snapshot);
  const withinWindow = ageMs <= MODULE_UI_SNAPSHOT_FRESHNESS_MS;
  const fresh = withinWindow && observed;

  let reason = null;
  let message = null;
  if (!withinWindow) {
    reason = "expired";
    const prefix = expiredMessagePrefix || `${moduleName} UI snapshot expired`;
    message = `${prefix} (${Math.round(ageMs / 1000)}s old); visit page to refresh`;
  } else if (!observed) {
    reason = "stale_zero";
    message =
      staleZeroMessage ||
      `${moduleName} UI snapshot not fresh (stored snapshot invalid); visit page after load`;
  }

  if (apiValidatedAt != null) {
    predatorStore.setModuleApiValidationAt(moduleName, apiValidatedAt);
  }

  return {
    fresh,
    rendered: fresh ? candidate.snapshot : null,
    reason: fresh ? null : reason,
    message: fresh ? null : message,
    ageMs,
    source: candidate.source,
    capturedAt: candidate.capturedAt,
    apiValidatedAt: apiValidatedAt ?? null,
  };
}

export function recordCollectionsRenderedSnapshot(snapshot, meta = {}) {
  recordModuleRenderedSnapshot(COLLECTIONS_MODULE, snapshot, hasObservedCollectionsSnapshot, {
    source: meta.source || "CollectionsPage.render",
  });
  if (hasVisibleCollectionsSnapshot(snapshot)) {
    predatorStore.clearStaleZeroUiStateTraces(COLLECTIONS_MODULE);
  }
}

export function recordQualificationRenderedSnapshot(snapshot, meta = {}) {
  recordModuleRenderedSnapshot(
    QUALIFICATION_REVIEW_MODULE,
    snapshot,
    hasObservedQualificationSnapshot,
    { source: meta.source || "QualificationReviewPage.render" }
  );
  if (hasVisibleQualificationSnapshot(snapshot)) {
    predatorStore.clearStaleZeroUiStateTraces(QUALIFICATION_REVIEW_MODULE);
  }
}

export function resolveCollectionsUiSnapshot(params = {}) {
  return resolveModuleUiSnapshot({
    moduleName: COLLECTIONS_MODULE,
    explicitRendered: params.explicitRendered ?? null,
    isObserved: hasObservedCollectionsSnapshot,
    missingMessage:
      "Collections UI snapshot not fresh; visit Collections page or capture rendered snapshot",
    expiredMessagePrefix: "Collections UI snapshot expired",
    staleZeroMessage:
      "Collections UI snapshot not fresh (stored snapshot empty); visit Collections page after load",
    apiValidatedAt: params.apiValidatedAt,
  });
}

export function resolveQualificationUiSnapshot(params = {}) {
  return resolveModuleUiSnapshot({
    moduleName: QUALIFICATION_REVIEW_MODULE,
    explicitRendered: params.explicitRendered ?? null,
    isObserved: hasObservedQualificationSnapshot,
    missingMessage:
      "Qualification Analytics UI snapshot not fresh; visit Qualification Analytics page or capture rendered snapshot",
    expiredMessagePrefix: "Qualification Analytics UI snapshot expired",
    staleZeroMessage:
      "Qualification Analytics UI snapshot not fresh (stored snapshot empty); visit page after load",
    apiValidatedAt: params.apiValidatedAt,
  });
}
