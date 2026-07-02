/**
 * Founder snapshot — server-side tenant KPIs (no client aggregation).
 */
import { supabase } from "@/api/supabaseClient.js";
import { isReadAdapterExecutiveV1Enabled } from "@/config/readProjectionFlags.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {{ tenantId?: string, tenant_id?: string }} options
 */
export async function getFounderSnapshotRead(options = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!tenantId) {
    return { success: false, error: "tenant_id is required", data: null };
  }

  if (isReadAdapterExecutiveV1Enabled()) {
    const { readTenantExecutiveV1 } = await import("@/api/projectionReadAdapters.js");
    return readTenantExecutiveV1({ tenantId });
  }

  const { data, error } = await supabase.rpc("get_founder_snapshot", {
    p_tenant_id: tenantId,
  });

  if (error) {
    const missing = /get_founder_snapshot|function.*does not exist/i.test(error.message || "");
    return {
      success: false,
      readFailed: true,
      degraded: true,
      error: missing
        ? "Run sprint1_founder_snapshot_rpc migration in Supabase"
        : error.message || "Founder snapshot read failed",
      data: null,
    };
  }

  const payload = data && typeof data === "object" ? data : {};
  return {
    success: true,
    readFailed: false,
    degraded: false,
    data: payload,
    error: null,
  };
}
