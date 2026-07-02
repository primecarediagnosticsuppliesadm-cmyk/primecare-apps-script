import { useEffect, useRef } from "react";
import { QA_DIAGNOSTICS_ENABLED } from "@/config/environment.js";
import { qaDiagnosticsStore } from "@/qa/qaDiagnosticsStore.js";
import { perfMark } from "@/utils/perfLog.js";

/**
 * Records page mount → interactive render time and paint vitals (QA diagnostics).
 */
export function usePagePerformance(pageLabel) {
  const mountRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!pageLabel) return;
    mountRef.current = performance.now();
    reportedRef.current = false;
    perfMark(`page:${pageLabel}:mount`);

    if (!QA_DIAGNOSTICS_ENABLED || typeof PerformanceObserver === "undefined") {
      return undefined;
    }

    const observers = [];

    try {
      const paintObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            qaDiagnosticsStore.recordWebVital("fcp", entry.startTime, { page: pageLabel });
          }
        }
      });
      paintObs.observe({ type: "paint", buffered: true });
      observers.push(paintObs);
    } catch {
      /* unsupported */
    }

    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          qaDiagnosticsStore.recordWebVital("lcp", last.startTime, { page: pageLabel });
        }
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObs);
    } catch {
      /* unsupported */
    }

    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, [pageLabel]);

  useEffect(() => {
    if (!pageLabel || reportedRef.current) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (reportedRef.current) return;
        reportedRef.current = true;
        const ms = Math.round(performance.now() - mountRef.current);
        qaDiagnosticsStore.recordRender(pageLabel, ms, { kind: "page-ready" });
        perfMark(`page:${pageLabel}:ready ${ms}ms`);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pageLabel]);
}
