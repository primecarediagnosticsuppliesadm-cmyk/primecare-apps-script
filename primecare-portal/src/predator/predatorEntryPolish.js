import { createPredatorEntry } from "@/predator/predatorSchema.js";

const STALE_SNAPSHOT_STEPS = new Set([
  "ui_snapshot_freshness",
  "ui.feed_sync",
  "ui.ledger_sync",
  "ui.feed_hydration",
]);

const FIX_HINTS = {
  "ui_snapshot_freshness": "Refresh the page or wait for the UI snapshot to settle before re-running Predator.",
  "ui.feed_sync": "Ensure the operational feed finished loading; avoid comparing API counts before backfill.",
  "ui.ledger_sync": "Open Executive Control Tower once to hydrate the ledger, then re-run validation.",
  "ui.drift_sync": "Expand Operational intelligence on Control Tower, then re-run module validation.",
  "reliability.consistency": "Review agent reliability inputs; sparse agent data can widen execution score gap.",
  "model.build": "Check network and Supabase reads; reload Operations Command Center payload.",
};

/**
 * Downgrade stale UI-only drift to INFO, dedupe steps, attach suggested fixes.
 * @param {import('@/predator/predatorSchema.js').PredatorDebugEntry[]} entries
 */
export function polishPredatorEntries(entries) {
  const byStep = new Map();

  for (const entry of entries) {
    let e = { ...entry };
    const step = e.step || "";

    if (STALE_SNAPSHOT_STEPS.has(step) && e.status === "WARN") {
      const stale =
        e.actual?.stale === true ||
        e.rootCauseGuess?.toLowerCase().includes("stale") ||
        String(e.actual?.capturedAt || "").length > 0;
      if (stale) {
        e = createPredatorEntry({
          ...e,
          status: "INFO",
          issueClass: "stale_snapshot",
          severity: "low",
          suggestedFix: FIX_HINTS[step] || e.suggestedFix,
          rootCauseGuess: e.rootCauseGuess || "UI snapshot not yet aligned with API (not a data failure)",
        });
      }
    }

    if (!e.suggestedFix && FIX_HINTS[step]) {
      e = { ...e, suggestedFix: FIX_HINTS[step] };
    }

    const prev = byStep.get(step);
    if (!prev) {
      byStep.set(step, e);
      continue;
    }
    const rank = { FAIL: 3, WARN: 2, INFO: 1, PASS: 0 };
    if ((rank[e.status] ?? 0) > (rank[prev.status] ?? 0)) {
      byStep.set(step, e);
    }
  }

  return [...byStep.values()];
}
