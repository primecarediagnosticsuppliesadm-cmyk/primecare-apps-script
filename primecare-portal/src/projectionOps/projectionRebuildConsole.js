/**
 * (6) Projection Rebuild Console — trigger rebuild_projection_v1.
 */
import { supabase } from "@/api/supabaseClient.js";
import { getRebuildCascade } from "./projectionOpsConstants.js";
import { recordRebuildRun } from "./projectionOpsStorage.js";

function str(v) {
  return String(v ?? "").trim();
}

export async function rebuildProjectionRegistry(tenantId, registryId, daysBack = 90) {
  const tid = str(tenantId);
  const rid = str(registryId);
  if (!supabase) {
    return { success: false, error: "Supabase not configured", registryId: rid };
  }
  if (!tid || !rid) {
    return { success: false, error: "tenant_id and registry_id required", registryId: rid };
  }

  const t0 = performance.now();
  const { data, error } = await supabase.rpc("rebuild_projection_v1", {
    p_tenant_id: tid,
    p_registry_id: rid,
    p_days_back: daysBack,
  });
  const durationMs = Math.round(performance.now() - t0);

  const result = {
    success: !error && data?.success !== false,
    registryId: rid,
    rowCount: data?.row_count ?? data?.rowCount ?? null,
    durationMs,
    error: error?.message || null,
    data,
  };

  recordRebuildRun(result);
  return result;
}

export async function rebuildProjectionCascade(tenantId, daysBack = 90) {
  const cascade = getRebuildCascade();
  const results = [];
  for (const registryId of cascade) {
    const res = await rebuildProjectionRegistry(tenantId, registryId, daysBack);
    results.push(res);
    if (!res.success) break;
  }
  return {
    success: results.every((r) => r.success),
    results,
    cascade,
  };
}
