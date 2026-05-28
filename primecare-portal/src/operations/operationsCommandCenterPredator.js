import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { recordPredatorTiming } from "@/predator/predatorTiming.js";

const MODULE = "Operations Center";

/**
 * @param {string} step
 * @param {Record<string, unknown>} [detail]
 */
export function recordOperationsCenterEvent(step, detail) {
  if (!isPredatorEnabled()) return;
  recordPredatorTiming({
    module: MODULE,
    step,
    durationMs: 0,
    detail,
  });
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 */
export async function traceOperationsCenterLoad(fn) {
  if (!isPredatorEnabled()) return fn();
  const t0 = performance.now();
  recordOperationsCenterEvent("operations_center.load_start");
  try {
    const result = await fn();
    recordOperationsCenterEvent("operations_center.load_success", {
      durationMs: Math.round(performance.now() - t0),
      attentionCount: result?.attention?.length,
      feedCount: result?.feed?.length,
      healthScore: result?.health?.score,
    });
    return result;
  } catch (err) {
    recordOperationsCenterEvent("operations_center.load_error", {
      message: err?.message || String(err),
    });
    throw err;
  }
}