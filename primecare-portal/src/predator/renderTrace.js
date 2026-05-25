import { useEffect, useRef } from "react";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { predatorStore } from "@/predator/predatorStore.js";

/**
 * @param {string} module
 * @param {string} step
 * @param {Record<string, unknown>} [detail]
 */
export function recordPredatorRenderStep(module, step, detail) {
  if (!isPredatorEnabled()) return;
  predatorStore.recordRenderStep({
    module,
    step,
    detail: detail ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Frontend render pipeline tracing (mount → data → state → visible).
 * @param {string} moduleName
 * @param {{ ready?: boolean, hasData?: boolean, renderCount?: number }} state
 */
export function usePredatorRenderTrace(moduleName, { ready = false, hasData = false } = {}) {
  const mountAt = useRef(performance.now());
  const renderCount = useRef(0);
  const dataReceivedAt = useRef(null);
  const firstVisibleAt = useRef(null);

  useEffect(() => {
    if (!isPredatorEnabled()) return;
    recordPredatorRenderStep(moduleName, "page.mount", {
      t: Math.round(performance.now() - mountAt.current),
    });
  }, [moduleName]);

  useEffect(() => {
    if (!isPredatorEnabled() || !hasData || dataReceivedAt.current != null) return;
    dataReceivedAt.current = performance.now();
    recordPredatorRenderStep(moduleName, "data.received", {
      msSinceMount: Math.round(dataReceivedAt.current - mountAt.current),
    });
  }, [moduleName, hasData]);

  useEffect(() => {
    if (!isPredatorEnabled() || !ready || firstVisibleAt.current != null) return;
    firstVisibleAt.current = performance.now();
    recordPredatorRenderStep(moduleName, "ui.first_visible_render", {
      msSinceMount: Math.round(firstVisibleAt.current - mountAt.current),
      hydrationDelayMs: dataReceivedAt.current
        ? Math.round(firstVisibleAt.current - dataReceivedAt.current)
        : null,
    });
  }, [moduleName, ready]);

  useEffect(() => {
    if (!isPredatorEnabled()) return;
    renderCount.current += 1;
    if (renderCount.current > 8) {
      recordPredatorRenderStep(moduleName, "ui.rerender_loop", {
        renderCount: renderCount.current,
        rootCauseGuess: "Excessive rerenders may indicate unstable deps or state churn",
      });
    }
  });
}
