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
 */
export function recordPredatorCacheEvent({ cacheKey, event, ageMs, payloadAgeMs, summary }) {
  if (!isPredatorEnabled()) return;

  const staleZeroRisk =
    event === "hit" &&
    summary &&
    (summary.ordersCount === 0 || summary.outstandingReceivables === 0) &&
    ageMs != null &&
    ageMs > 0;

  predatorStore.recordCacheEvent({
    cacheKey,
    event,
    ageMs: ageMs ?? null,
    payloadAgeMs: payloadAgeMs ?? null,
    summary: summary ?? null,
    timestamp: new Date().toISOString(),
    staleZeroRisk,
  });

  if (staleZeroRisk) {
    predatorStore.recordError(
      createPredatorEntry({
        status: "WARN",
        module: "Cache",
        step: `${cacheKey}.stale_zero_snapshot`,
        actual: { cacheKey, event, ageMs, summary },
        rootCauseGuess: "Cache hit may be serving stale zero KPI snapshot",
        suggestedFix: "Invalidate cache and force fresh Supabase read (force: true)",
        severity: "high",
        issueClass: "data_integrity",
      })
    );
  }
}
