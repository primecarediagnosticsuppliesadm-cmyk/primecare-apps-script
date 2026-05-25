import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import {
  createPredatorEntry,
  PREDATOR_TIMING_THRESHOLDS_MS,
} from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";

/**
 * @param {string} stepKey
 * @param {number} durationMs
 */
function thresholdForStep(stepKey) {
  if (stepKey.includes("auth.bootstrap")) return PREDATOR_TIMING_THRESHOLDS_MS.authBootstrap;
  if (stepKey.includes("auth.profile")) return PREDATOR_TIMING_THRESHOLDS_MS.authProfileFetch;
  if (stepKey.includes("dashboard")) return PREDATOR_TIMING_THRESHOLDS_MS.dashboardLoad;
  if (stepKey.startsWith("supabase.")) return PREDATOR_TIMING_THRESHOLDS_MS.supabaseRead;
  if (stepKey.includes("kpi")) return PREDATOR_TIMING_THRESHOLDS_MS.kpiCompute;
  if (stepKey.includes("renderReady")) return PREDATOR_TIMING_THRESHOLDS_MS.uiRenderReady;
  if (stepKey.includes("payment") || stepKey.includes("collection"))
    return PREDATOR_TIMING_THRESHOLDS_MS.collectionsPaymentSave;
  if (stepKey.includes("qualification")) return PREDATOR_TIMING_THRESHOLDS_MS.qualificationSave;
  if (stepKey.includes("order")) return PREDATOR_TIMING_THRESHOLDS_MS.orderCreateOrFulfillment;
  if (stepKey.includes("inventory")) return PREDATOR_TIMING_THRESHOLDS_MS.inventoryUpdate;
  if (stepKey.includes("validation")) return PREDATOR_TIMING_THRESHOLDS_MS.moduleValidation;
  return PREDATOR_TIMING_THRESHOLDS_MS.supabaseRead;
}

/**
 * @param {Object} params
 * @param {string} params.module
 * @param {string} params.step
 * @param {number} params.durationMs
 * @param {Record<string, unknown>} [params.detail]
 */
export function recordPredatorTiming({ module, step, durationMs, detail }) {
  if (!isPredatorEnabled()) return;
  const threshold = thresholdForStep(step);
  const slow = durationMs > threshold;
  const entry = createPredatorEntry({
    status: slow ? "WARN" : "PASS",
    module,
    step,
    durationMs,
    expected: `<= ${threshold}ms`,
    actual: { durationMs, ...(detail || {}) },
    rootCauseGuess: slow ? "Process exceeded Predator timing threshold" : "",
    suggestedFix: slow
      ? "Check Supabase query shape, RLS, parallel batch size, or network latency"
      : "",
    severity: slow ? "medium" : "low",
  });
  predatorStore.recordTiming(entry);
}

/**
 * @template T
 * @param {string} module
 * @param {string} step
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>}
 */
export async function predatorTrace(module, step, fn) {
  if (!isPredatorEnabled()) return fn();
  const t0 = performance.now();
  try {
    const result = await fn();
    recordPredatorTiming({
      module,
      step,
      durationMs: Math.round(performance.now() - t0),
    });
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - t0);
    recordPredatorTiming({ module, step, durationMs, detail: { error: true } });
    predatorStore.recordError(
      createPredatorEntry({
        status: "FAIL",
        module,
        step,
        durationMs,
        actual: { message: err?.message || String(err) },
        rootCauseGuess: "Unhandled exception during traced step",
        suggestedFix: "Inspect stack trace and module API contract",
        severity: "critical",
      })
    );
    throw err;
  }
}
