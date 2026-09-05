/**
 * Client-triggered projection refresh (Blueprint 18 pipeline v0).
 * Fire-and-forget after order-domain writes; does not block UI.
 */
import { supabase } from "@/api/supabaseClient.js";
import { hqDebugWarn } from "@/utils/hqDebugLog.js";

function str(v) {
  return String(v ?? "").trim();
}

async function rpcRefresh(name, args) {
  if (!supabase) return { success: false, skipped: true };
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    hqDebugWarn(`[projectionRefresh] ${name}:`, error.message || error);
    return { success: false, error: error.message || String(error) };
  }
  return { success: true, data };
}

export async function refreshProjectionOrderRow(tenantId, orderId) {
  const tid = str(tenantId);
  const oid = str(orderId);
  if (!tid || !oid) return { success: false, skipped: true };
  return rpcRefresh("refresh_proj_order_row_v1", {
    p_tenant_id: tid,
    p_order_id: oid,
    p_cascade_metrics: true,
  });
}

export async function refreshProjectionLabReceivableRow(tenantId, labId) {
  const tid = str(tenantId);
  const lid = str(labId);
  if (!tid || !lid) return { success: false, skipped: true };
  return rpcRefresh("refresh_proj_lab_receivable_row_v1", {
    p_tenant_id: tid,
    p_lab_id: lid,
    p_cascade_metrics: true,
  });
}

export async function rebuildProjectionV1(tenantId, registryId, daysBack = 90) {
  const tid = str(tenantId);
  const rid = str(registryId);
  if (!tid || !rid) return { success: false, skipped: true };
  return rpcRefresh("rebuild_projection_v1", {
    p_tenant_id: tid,
    p_registry_id: rid,
    p_days_back: daysBack,
  });
}

/** Non-blocking refresh after order write success. */
export function scheduleProjectionRefreshAfterOrderWrite({ tenantId, orderId, labId } = {}) {
  void refreshProjectionOrderRow(tenantId, orderId).catch(() => {});
  if (labId) {
    void refreshProjectionLabReceivableRow(tenantId, labId).catch(() => {});
  }
}
