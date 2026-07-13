/**
 * Performance timing (enable with VITE_PERF_LOG=true in any environment).
 */
import { isHqDebugLogEnabled } from "@/utils/hqDebugLog.js";
import { QA_DIAGNOSTICS_ENABLED } from "@/config/environment.js";
import { qaDiagnosticsStore } from "@/qa/qaDiagnosticsStore.js";

export function isPerfLogEnabled() {
  return String(import.meta.env.VITE_PERF_LOG || "").trim().toLowerCase() === "true";
}

function recordTiming(label, ms, extra) {
  if (!QA_DIAGNOSTICS_ENABLED) return;
  const kind = String(extra?.kind || "").toLowerCase();
  if (kind === "rpc" || label.includes(".rpc") || label.startsWith("rpc:")) {
    qaDiagnosticsStore.recordRpc(label, ms, extra);
    return;
  }
  if (kind === "render" || label.startsWith("page:")) {
    qaDiagnosticsStore.recordRender(label, ms, extra);
    return;
  }
  qaDiagnosticsStore.recordApi(label, ms, extra);
}

export function perfLog(label, detail) {
  if (isPerfLogEnabled()) {
    if (detail !== undefined) {
      console.info(`[perf] ${label}`, detail);
    } else {
      console.info(`[perf] ${label}`);
    }
  }
  if (QA_DIAGNOSTICS_ENABLED && detail?.ms != null) {
    recordTiming(label, detail.ms, detail);
  }
}

export function perfTime(label) {
  const enabled = isPerfLogEnabled() || QA_DIAGNOSTICS_ENABLED;
  if (!enabled) return () => {};
  const t0 = performance.now();
  return (extra) => {
    const ms = Math.round(performance.now() - t0);
    if (isPerfLogEnabled()) {
      perfLog(`${label} ${ms}ms`, extra);
    }
    if (QA_DIAGNOSTICS_ENABLED) {
      recordTiming(label, ms, extra);
    }
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
