import { supabase } from "@/api/supabaseClient.js";
import { rowToCommissionEntry } from "@/api/commissionSupabaseApi.js";
import { loadVisibleLabContracts } from "@/labContract/labContractStore.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildExecutiveActionQueue } from "@/operations/executiveActionQueueEngine.js";
import { loadLabOwnershipMetricsBundle } from "@/operations/operationsCenterAdminData.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Pending commission entries for executive queue (RLS-scoped).
 */
export async function fetchPendingCommissionEntries(limit = 20) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("commission_entries")
    .select("*")
    .eq("status", "pending")
    .order("commission_amount", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    console.warn("[executiveActionQueue] commission read:", error.message);
    return [];
  }
  return (Array.isArray(data) ? data : []).map(rowToCommissionEntry).filter(Boolean);
}

/**
 * Load contracts + commission pending for action queue enrichment.
 * Reuses ops payload when caller already has it.
 */
export async function loadExecutiveActionQueueEnrichment(currentUser, options = {}) {
  const existingPayload = options.payload || null;
  const tenantId = str(currentUser?.tenantId ?? currentUser?.tenant_id);
  const [payload, contracts, pendingCommissions, ownershipBundle] = await Promise.all([
    existingPayload
      ? Promise.resolve(existingPayload)
      : loadOperationsCommandCenterData(currentUser, { force: options.force }),
    loadVisibleLabContracts(),
    fetchPendingCommissionEntries(options.commissionLimit ?? 20),
    tenantId ? loadLabOwnershipMetricsBundle(tenantId) : Promise.resolve(null),
  ]);

  return {
    payload,
    contracts: Array.isArray(contracts) ? contracts : [],
    pendingCommissions,
    ownershipMetrics: ownershipBundle?.ownershipMetrics || null,
    directoryUsers: ownershipBundle?.directoryUsers || [],
  };
}

/**
 * Full bundle for Control Tower + badge counts.
 */
export async function loadExecutiveActionQueueBundle(currentUser, options = {}) {
  const enrichment = await loadExecutiveActionQueueEnrichment(currentUser, options);
  const tenantId = str(currentUser?.tenantId ?? currentUser?.tenant_id);
  const queue = buildExecutiveActionQueue({
    payload: enrichment.payload,
    contracts: enrichment.contracts,
    pendingCommissions: enrichment.pendingCommissions,
    ownershipMetrics: enrichment.ownershipMetrics,
    directoryUsers: enrichment.directoryUsers,
    tenantId,
    options: {
      qualificationLimit: options.qualificationLimit,
      commissionLimit: options.commissionLimit,
    },
  });

  return {
    ...enrichment,
    queue,
    tenantId,
  };
}
