import { predatorStore } from "@/predator/predatorStore.js";

export const ADMIN_DASHBOARD_MODULE = "Admin Dashboard";

/** Max age for a rendered KPI snapshot to count as fresh for Predator UI comparison. */
export const ADMIN_DASHBOARD_UI_SNAPSHOT_FRESHNESS_MS = 2 * 60 * 1000;

/**
 * @param {{ executive?: object, summary?: object }|null|undefined} rendered
 */
export function hasVisibleRenderedKpis(rendered) {
  if (!rendered?.executive && !rendered?.summary) return false;
  const e = rendered.executive || {};
  const s = rendered.summary || {};
  const stock = s.stockStats || {};
  return (
    Number(e.outstandingReceivables) > 0 ||
    Number(s.recentVisits) > 0 ||
    Number(s.inventorySkus ?? stock.totalSkus) > 0 ||
    Number(s.totalSoldValue) > 0
  );
}

/**
 * Persist latest Admin Dashboard rendered KPI snapshot (from live page).
 * @param {{ executive?: object, summary?: object }} snapshot
 * @param {{ source?: string, kpiModel?: object|null }} [meta]
 */
export function recordAdminDashboardRenderedSnapshot(snapshot, meta = {}) {
  if (!snapshot?.executive || !snapshot?.summary) return;

  predatorStore.setModuleRenderedSnapshot(ADMIN_DASHBOARD_MODULE, {
    snapshot,
    source: meta.source || "AdminDashboard.render",
    capturedAt: Date.now(),
    kpiModel: meta.kpiModel ?? null,
  });

  if (hasVisibleRenderedKpis(snapshot)) {
    predatorStore.clearStaleZeroUiStateTraces(ADMIN_DASHBOARD_MODULE);
  }
}

/**
 * Resolve UI snapshot for validation: explicit param wins, else stored if fresh.
 * @param {Object} params
 * @param {{ executive?: object, summary?: object }|null|undefined} [params.explicitRendered]
 * @param {number} [params.apiValidatedAt] — ms when getAdminDashboardRead completed
 */
export function resolveAdminDashboardUiSnapshot({ explicitRendered = null, apiValidatedAt } = {}) {
  const now = Date.now();
  const stored = predatorStore.getModuleRenderedSnapshot(ADMIN_DASHBOARD_MODULE);

  if (explicitRendered?.executive && explicitRendered?.summary && hasVisibleRenderedKpis(explicitRendered)) {
    if (apiValidatedAt != null) {
      predatorStore.setModuleApiValidationAt(ADMIN_DASHBOARD_MODULE, apiValidatedAt);
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

  /** @type {{ snapshot: object, source: string, capturedAt: number }|null} */
  let candidate = null;

  if (stored?.snapshot) {
    candidate = {
      snapshot: stored.snapshot,
      source: stored.source || "unknown",
      capturedAt: stored.capturedAt,
    };
  }

  if (!candidate) {
    return {
      fresh: false,
      rendered: null,
      reason: "missing",
      message:
        "Admin Dashboard UI snapshot not fresh; visit Admin Dashboard page or capture rendered snapshot",
      ageMs: null,
      source: null,
      capturedAt: null,
      apiValidatedAt: apiValidatedAt ?? null,
    };
  }

  const ageMs = now - candidate.capturedAt;
  const visible = hasVisibleRenderedKpis(candidate.snapshot);
  const withinWindow = ageMs <= ADMIN_DASHBOARD_UI_SNAPSHOT_FRESHNESS_MS;
  const fresh = withinWindow && visible;

  let reason = null;
  let message = null;
  if (!withinWindow) {
    reason = "expired";
    message = `Admin Dashboard UI snapshot expired (${Math.round(ageMs / 1000)}s old); visit page to refresh`;
  } else if (!visible) {
    reason = "stale_zero";
    message =
      "Admin Dashboard UI snapshot not fresh (stored snapshot has zero KPIs); visit page after load";
  }

  if (apiValidatedAt != null) {
    predatorStore.setModuleApiValidationAt(ADMIN_DASHBOARD_MODULE, apiValidatedAt);
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
