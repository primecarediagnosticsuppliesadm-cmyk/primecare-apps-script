import { useEffect, useRef } from "react";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { recordPredatorUiMetricSnapshot } from "@/predator/uiStateReliability.js";
import { recordPredatorRenderStep } from "@/predator/renderTrace.js";

/**
 * Lightweight UI sync tracing for a module's KPI metrics.
 * Caps snapshots via predatorStore; no full state dumps.
 *
 * @param {string} moduleName
 * @param {Object} options
 * @param {boolean} options.loading
 * @param {boolean} [options.apiReady]
 * @param {Record<string, { api?: number|null, state?: number|null, render?: number|null }>} [options.metrics]
 */
export function usePredatorUiSyncTrace(moduleName, { loading, apiReady = false, metrics = {} }) {
  const apiReadyAt = useRef(null);
  const stateReadyAt = useRef(null);
  const renderedAt = useRef(null);
  const lastMetricsKey = useRef("");

  useEffect(() => {
    if (!isPredatorEnabled() || loading) return;

    if (apiReady && apiReadyAt.current == null) {
      apiReadyAt.current = performance.now();
      recordPredatorRenderStep(moduleName, "pipeline.api_complete", {
        msSinceMount: Math.round(apiReadyAt.current),
      });
    }
  }, [moduleName, loading, apiReady]);

  useEffect(() => {
    if (!isPredatorEnabled() || loading) return;

    const entries = Object.entries(metrics);
    if (entries.length === 0) return;

    const key = JSON.stringify(metrics);
    if (key === lastMetricsKey.current) return;
    lastMetricsKey.current = key;

    let anyState = false;
    let anyRender = false;

    for (const [metricId, vals] of entries) {
      const api = vals.api ?? null;
      const state = vals.state ?? null;
      const render = vals.render ?? null;

      if (state != null) anyState = true;
      if (render != null) anyRender = true;

      recordPredatorUiMetricSnapshot({
        module: moduleName,
        metricId,
        api,
        state,
        render,
        source: "usePredatorUiSyncTrace",
      });

    }

    if (anyState && stateReadyAt.current == null) {
      stateReadyAt.current = performance.now();
      recordPredatorRenderStep(moduleName, "state.hydrated", {
        hydrationDelayMs: apiReadyAt.current
          ? Math.round(stateReadyAt.current - apiReadyAt.current)
          : null,
      });
    }

    if (anyRender && renderedAt.current == null) {
      renderedAt.current = performance.now();
      const hydrationDelay =
        stateReadyAt.current && apiReadyAt.current
          ? Math.round(renderedAt.current - stateReadyAt.current)
          : null;

      if (apiReadyAt.current && renderedAt.current < apiReadyAt.current + 50) {
        recordPredatorRenderStep(moduleName, "ui.render_before_hydration", {
          msSinceApi: apiReadyAt.current
            ? Math.round(renderedAt.current - apiReadyAt.current)
            : null,
        });
      }

      recordPredatorRenderStep(moduleName, "ui.first_visible_render", {
        hydrationDelayMs: hydrationDelay,
        msSinceMount: Math.round(renderedAt.current),
      });
    }
  }, [moduleName, loading, metrics, apiReady]);
}
