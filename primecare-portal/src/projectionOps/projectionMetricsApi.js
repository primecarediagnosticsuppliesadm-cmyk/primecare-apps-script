/**
 * (10) Projection Metrics API — single read-only aggregate for ops center.
 */
import { supabase } from "@/api/supabaseClient.js";
import { buildProjectionHealthRecords, summarizeHealthRegistry } from "./projectionHealthRegistry.js";
import { buildProjectionRefreshTimeline } from "./projectionRefreshTimeline.js";
import { buildFreshnessDashboard } from "./projectionFreshnessDashboard.js";
import { buildParityDashboard } from "./projectionParityDashboard.js";
import { buildFailureDashboard } from "./projectionFailureDashboard.js";
import { buildShadowMonitoring } from "./projectionShadowMonitoring.js";
import { buildProjectionCertificationReport } from "./projectionCertificationReport.js";
import { buildProjectionDriftAlerts } from "./projectionDriftAlerts.js";
import { getRebuildHistory } from "./projectionOpsStorage.js";
import { buildHealthSnapshot, logStructured } from "@/observability/monitoring.js";

function str(v) {
  return String(v ?? "").trim();
}

async function fetchMetaRows(tenantId) {
  if (!supabase || !tenantId) return { rows: [], error: "missing_client_or_tenant" };
  const { data, error } = await supabase
    .from("hq_projection_meta_v1")
    .select("tenant_id,registry_id,as_of,row_count,model_version,last_error,updated_at")
    .eq("tenant_id", tenantId);
  if (error) {
    const missing = /does not exist/i.test(error.message || "");
    return { rows: [], error: missing ? "meta_table_not_deployed" : error.message };
  }
  return { rows: data || [], error: null };
}

async function probeAdapterDeploy(catalogEntry, tenantId) {
  if (!supabase || !catalogEntry?.adapterRpc || !tenantId) {
    return { deployed: null, skipped: true };
  }
  const rpc = catalogEntry.adapterRpc;
  const args =
    rpc === "read_orders_list_v1"
      ? { p_limit: 1, p_offset: 0, p_days_back: 90 }
      : rpc === "read_lab_receivables_list_v1"
        ? { p_limit: 1, p_days_back: 90 }
        : { p_tenant_id: tenantId };
  const { error } = await supabase.rpc(rpc, args);
  if (!error) return { deployed: true, skipped: false };
  const missing = /does not exist|Could not find/i.test(error.message || "");
  return { deployed: !missing, skipped: false, error: error.message };
}

/**
 * @param {{ tenantId?: string, tenant_id?: string, probeAdapters?: boolean }} options
 */
export async function loadProjectionMetrics(options = {}) {
  const tenantId = str(options.tenantId ?? options.tenant_id);
  const t0 = performance.now();

  const metaRes = await fetchMetaRows(tenantId);
  let healthRecords = buildProjectionHealthRecords(tenantId, metaRes.rows);

  if (options.probeAdapters) {
    const { getCatalogProjections } = await import("./projectionOpsConstants.js");
    const { recordParityResult } = await import("./projectionOpsStorage.js");
    for (const entry of getCatalogProjections()) {
      if (!entry.adapterRpc) continue;
      const probe = await probeAdapterDeploy(entry, tenantId);
      if (probe.skipped) continue;
      const status = probe.deployed ? "PASS" : "FAIL";
      recordParityResult(entry.registryId, status);
    }
    healthRecords = buildProjectionHealthRecords(tenantId, metaRes.rows);
  }

  const freshnessDashboard = buildFreshnessDashboard(healthRecords);
  const parityDashboard = buildParityDashboard(healthRecords);
  const failureDashboard = buildFailureDashboard(healthRecords);
  const shadowMonitoring = buildShadowMonitoring(healthRecords);
  const driftAlerts = buildProjectionDriftAlerts(healthRecords);
  const refreshTimeline = buildProjectionRefreshTimeline(healthRecords, getRebuildHistory());
  const certificationReport = buildProjectionCertificationReport({
    healthRecords,
    freshnessDashboard,
    parityDashboard,
    failureDashboard,
    shadowMonitoring,
    driftAlerts,
  });

  const monitoringHealth = buildHealthSnapshot({
    overall: certificationReport?.overall || "UNKNOWN",
    freshFail: freshnessDashboard?.failCount ?? 0,
    driftAlerts: driftAlerts?.alerts?.length ?? 0,
  });

  logStructured("info", "projection_ops.metrics_loaded", {
    tenantId,
    durationMs: Math.round(performance.now() - t0),
    overall: certificationReport?.overall,
  });

  return {
    success: metaRes.error !== "meta_table_not_deployed",
    tenantId,
    loadedAt: new Date().toISOString(),
    loadDurationMs: Math.round(performance.now() - t0),
    metaError: metaRes.error,
    healthRegistry: healthRecords,
    healthSummary: summarizeHealthRegistry(healthRecords),
    refreshTimeline,
    freshnessDashboard,
    parityDashboard,
    failureDashboard,
    shadowMonitoring,
    certificationReport,
    driftAlerts,
    monitoringHealth,
  };
}

export { buildProjectionHealthRecords, summarizeHealthRegistry };
