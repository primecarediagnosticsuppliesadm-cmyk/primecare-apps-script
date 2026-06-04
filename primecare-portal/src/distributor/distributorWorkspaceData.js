import { supabase } from "@/api/supabaseClient.js";
import { loadTenantFoundationRegistry } from "@/tenant/tenantFoundationData.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { metricsFromOpsPayload } from "@/tenant/tenantFoundationData.js";
import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { getRegistryTenant, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";
import {
  buildDistributorRegistry,
  buildDistributorWorkspace,
} from "@/distributor/distributorWorkspaceEngine.js";
import { computeFounderOperationalSignals } from "@/founder/founderPilotReadinessCompute.js";
import { readLabContractRegistry } from "@/labContract/labContractStore.js";

function str(v) {
  return String(v ?? "").trim();
}

export async function fetchAgentProfilesForTenant(tenantId) {
  if (!supabase || !tenantId) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role, agent_name, active")
    .eq("tenant_id", tenantId)
    .eq("role", "agent");
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

/**
 * Load registry + optional live workspace for home distributor.
 */
export async function loadDistributorWorkspaceBundle(currentUser, options = {}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const foundation = await loadTenantFoundationRegistry(currentUser, {
    force: options.force,
  });

  let opsPayload = foundation.opsPayload;
  let agentProfiles = [];

  if (homeTenantId) {
    agentProfiles = await fetchAgentProfilesForTenant(homeTenantId);
  }
  if (!opsPayload && homeTenantId) {
    try {
      opsPayload = await loadOperationsCommandCenterData(currentUser, { force: options.force });
    } catch (err) {
      console.warn("[distributorWorkspace] ops load failed", err);
    }
  }

  if (homeTenantId && opsPayload) {
    const liveMetrics = metricsFromOpsPayload(opsPayload);
    const coll = summarizeCollectionsList(opsPayload.collections || []);
    const signals = computeFounderOperationalSignals(opsPayload, homeTenantId);
    const existing = getRegistryTenant(homeTenantId) || { id: homeTenantId, name: "PrimeCare HQ" };
    upsertRegistryTenant({
      ...existing,
      metrics: {
        ...liveMetrics,
        agents: agentProfiles.length,
        outstanding: coll.totalOutstanding,
        overdueCollections: coll.overdueCount,
        proofCompliancePct: signals.proofCompliancePct,
        openInterventions: signals.overdueInterventions,
        agentCount: agentProfiles.length,
      },
    });
  }

  const refreshed = await loadTenantFoundationRegistry(currentUser, { skipLiveLoad: true });
  const registry = buildDistributorRegistry(refreshed.tenants);

  const registryContracts = homeTenantId
    ? readLabContractRegistry(homeTenantId).contracts
    : [];
  const contracts = Array.isArray(registryContracts) ? registryContracts : [];

  return {
    registry,
    homeTenantId,
    opsPayload,
    agentProfiles,
    foundation: refreshed,
    contracts,
  };
}

export function resolveDistributorWorkspace(
  bundle,
  selectedDistributorId,
  { viewTenantId, readOnly, homeTenantId }
) {
  const id = str(selectedDistributorId) || str(viewTenantId) || homeTenantId;
  const row =
    bundle.registry.find((d) => d.id === id) ||
    bundle.registry.find((d) => d.isHome) ||
    bundle.registry[0] ||
    null;

  if (!row) return null;

  const isLive =
    row.id === homeTenantId &&
    (!readOnly || viewTenantId === homeTenantId) &&
    Boolean(bundle.opsPayload);

  return buildDistributorWorkspace({
    distributorRow: {
      ...row,
      createdAt: bundle.foundation?.tenants?.find((t) => t.id === row.id)?.createdAt,
    },
    payload: isLive ? bundle.opsPayload : null,
    agentProfiles: isLive ? bundle.agentProfiles : [],
    isLive,
    homeTenantId,
    contracts: Array.isArray(bundle.contracts) ? bundle.contracts : [],
  });
}
