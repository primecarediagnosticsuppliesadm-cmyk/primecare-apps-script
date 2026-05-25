/**
 * Dev-only performance timing (enable with VITE_PERF_LOG=true).
 */
export function perfLog(label, detail) {
  if (!import.meta.env.DEV) return;
  if (String(import.meta.env.VITE_PERF_LOG || "").trim().toLowerCase() !== "true") {
    return;
  }
  if (detail !== undefined) {
    console.info(`[perf] ${label}`, detail);
  } else {
    console.info(`[perf] ${label}`);
  }
}

export function perfTime(label) {
  if (!import.meta.env.DEV) return () => {};
  if (String(import.meta.env.VITE_PERF_LOG || "").trim().toLowerCase() !== "true") {
    return () => {};
  }
  const t0 = performance.now();
  return (extra) => {
    const ms = Math.round(performance.now() - t0);
    perfLog(`${label} ${ms}ms`, extra);
  };
}

export function shouldRunDashboardKpiAudit() {
  return (
    import.meta.env.DEV &&
    String(import.meta.env.VITE_DASHBOARD_KPI_AUDIT || "").trim().toLowerCase() === "true"
  );
}
