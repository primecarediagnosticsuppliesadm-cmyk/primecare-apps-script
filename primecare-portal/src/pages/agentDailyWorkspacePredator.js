import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { recordPredatorTiming } from "@/predator/predatorTiming.js";

const MODULE = "Agent Daily Workspace";

/**
 * @template T
 * @param {() => Promise<T>} fn
 */
export async function traceAgentDailyWorkspaceLoad(fn) {
  if (!isPredatorEnabled()) return fn();
  const t0 = performance.now();
  try {
    const result = await fn();
    recordPredatorTiming({
      module: MODULE,
      step: "agent_daily_workspace.load_success",
      durationMs: Math.round(performance.now() - t0),
      detail: {
        assignedLabs: result?.kpis?.assignedLabs,
        queueCount: result?.actionQueue?.length,
      },
    });
    return result;
  } catch (err) {
    recordPredatorTiming({
      module: MODULE,
      step: "agent_daily_workspace.load_error",
      durationMs: Math.round(performance.now() - t0),
      detail: { message: err?.message || String(err) },
    });
    predatorStore.recordError(
      createPredatorEntry({
        status: "FAIL",
        module: MODULE,
        step: "agent_daily_workspace.load_error",
        actual: { message: err?.message || String(err) },
        rootCauseGuess: "Agent daily workspace failed to load",
        suggestedFix: "Check getAgentWorkspaceRead and RLS-scoped filters",
        severity: "high",
      })
    );
    throw err;
  }
}

/**
 * @param {string} step
 * @param {Record<string, unknown>} [detail]
 */
export function recordAgentDailyWorkspaceEvent(step, detail) {
  if (!isPredatorEnabled()) return;
  recordPredatorTiming({
    module: MODULE,
    step,
    durationMs: 0,
    detail,
  });
}
