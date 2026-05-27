import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";

/**
 * Read-only cache observability (no cache behavior changes).
 * @param {Object} params
 * @param {string} params.cacheKey
 * @param {'hit' | 'miss' | 'invalidate' | 'stale_reuse' | 'skip'} params.event
 * @param {number} [params.ageMs]
 * @param {number} [params.payloadAgeMs]
 * @param {Record<string, unknown>} [params.summary]
 * @param {string} [params.source]
 * @param {'hydrate'|'overwrite'|'invalidate'} [params.hydrationPhase]
 */
export function recordPredatorCacheEvent({
  cacheKey,
  event,
  ageMs,
  payloadAgeMs,
  summary,
  source,
  hydrationPhase,
}) {
  if (!isPredatorEnabled()) return;

  const staleZeroRisk =
    (event === "hit" || event === "stale_reuse") &&
    summary &&
    ageMs != null &&
    ageMs > 0 &&
    Number(summary.outstandingReceivables ?? 0) === 0 &&
    Number(summary.recentVisits ?? 0) === 0 &&
    Number(summary.totalSkus ?? 0) === 0 &&
    Number(summary.totalSoldValue ?? summary.ordersCount ?? 0) === 0;

  const derivedBeforeHydration =
    hydrationPhase === "hydrate" &&
    event === "hit" &&
    summary &&
    summary.outstandingReceivables === 0 &&
    ageMs != null &&
    ageMs > 5000;

  predatorStore.recordCacheEvent({
    cacheKey,
    event,
    ageMs: ageMs ?? null,
    payloadAgeMs: payloadAgeMs ?? null,
    summary: summary ?? null,
    source: source ?? null,
    hydrationPhase: hydrationPhase ?? null,
    timestamp: new Date().toISOString(),
    staleZeroRisk,
    derivedBeforeHydration,
  });

  if (staleZeroRisk) {
    predatorStore.recordError(
      createPredatorEntry({
        status: "WARN",
        module: "Cache",
        step: `${cacheKey}.stale_zero_snapshot`,
        actual: { cacheKey, event, ageMs, summary, source },
        rootCauseGuess: "UI hydrated from stale zero snapshot",
        suggestedFix: "Invalidate cache and force fresh Supabase read (force: true)",
        severity: "high",
        issueClass: "ui_sync",
      })
    );
  }

  if (event === "hit" && hydrationPhase === "overwrite" && source) {
    predatorStore.recordError(
      createPredatorEntry({
        status: "WARN",
        module: "Cache",
        step: `${cacheKey}.cache_overwrite`,
        actual: { cacheKey, source, ageMs },
        rootCauseGuess: "Fallback state overwrote loaded data",
        suggestedFix: "Trace cache write order — ensure API payload wins over module defaults",
        severity: "medium",
        issueClass: "ui_sync",
      })
    );
  }

  if (derivedBeforeHydration) {
    predatorStore.recordError(
      createPredatorEntry({
        status: "WARN",
        module: "Cache",
        step: `${cacheKey}.derived_before_hydration`,
        actual: { cacheKey, ageMs, summary },
        rootCauseGuess: "Derived memo computed before API hydration",
        suggestedFix: "Defer KPI compute until getAdminDashboardRead completes",
        severity: "medium",
        issueClass: "ui_sync",
      })
    );
  }
}
