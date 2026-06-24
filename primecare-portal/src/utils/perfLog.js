/**
 * Performance timing (enable with VITE_PERF_LOG=true in any environment).
 */
import { isHqDebugLogEnabled } from "@/utils/hqDebugLog.js";

export function isPerfLogEnabled() {
  return String(import.meta.env.VITE_PERF_LOG || "").trim().toLowerCase() === "true";
}

export function perfLog(label, detail) {
  if (!isPerfLogEnabled()) return;
  if (detail !== undefined) {
    console.info(`[perf] ${label}`, detail);
  } else {
    console.info(`[perf] ${label}`);
  }
}

export function perfTime(label) {
  if (!isPerfLogEnabled()) return () => {};
  const t0 = performance.now();
  return (extra) => {
    const ms = Math.round(performance.now() - t0);
    perfLog(`${label} ${ms}ms`, extra);
  };
}

/** Monotonic mark for cross-step timelines (login → dashboard ready). */
export function perfMark(label) {
  if (!isPerfLogEnabled()) return;
  perfLog(label, { t: Math.round(performance.now()) });
}

export function shouldRunDashboardKpiAudit() {
  return (
    isHqDebugLogEnabled() &&
    String(import.meta.env.VITE_DASHBOARD_KPI_AUDIT || "").trim().toLowerCase() === "true"
  );
}
